var request = require('request'),
    log     = require('./log');

/**
 * SessionManager Constructor
 *
 * @param {Object} options
 * @api public
 */
function SessionManager (options) {

  log.debug('[chimp][session-manager] options are', options);

  if (!options) {
    throw new Error('options is required');
  }

  if (!options.port) {
    throw new Error('options.port is required');
  }

  if (!options.browser && !options.deviceName) {
    throw new Error('[chimp][session-manager] options.browser or options.deviceName is required');
  }

  this.options = options;

  this.maxRetries = 30;
  this.retryDelay = 3000;
  this.retry = 0;

  log.debug('[chimp][session-manager] created a new SessionManager', options);

}

SessionManager.prototype.webdriver = require('webdriverio');

/**
 * Wraps the webdriver remote method and allows reuse options
 *
 * @api public
 */
SessionManager.prototype.remote = function (webdriverOptions, callback) {

  var self = this;

  log.debug('[chimp][session-manager] creating webdriver remote ');
  var browser = this.webdriver.remote(webdriverOptions);

  function decideReuse () {

    if (self.options.browser === 'phantomjs') {
      log.debug('[chimp][session-manager] browser is phantomjs, not reusing a session');
      callback(null, browser);
      return;
    }

    if (!!process.env['no-session-reuse']) {
      log.debug('[chimp][session-manager] no-session-reuse is true, not reusing a session');
      callback(null, browser);
      return;
    }

    if (!process.env['chimp.watch'] && !process.env['chimp.server']) {
      log.debug('[chimp][session-manager] watch mode is false, not reusing a session');
      callback(null, browser);
      return;
    }

    self._getWebdriverSessions(function (err, sessions) {
      if (sessions.length !== 0) {
        log.debug('[chimp][session-manager] Found an open selenium sessions, reusing session', sessions[0].id);
        browser.requestHandler.sessionID = sessions[0].id;
      }

      log.debug('[chimp][session-manager] Did not find any open selenium sessions, not reusing a session');
      browser = self._monkeyPatchBrowserSessionManagement(browser, sessions);
      callback(null, browser);
    });

  }

  this._waitForConnection(browser, decideReuse);

};


SessionManager.prototype._waitForConnection = function(browser, callback) {
  log.debug('[chimp][session-manager] checking connection to selenium server');
  var self = this;
  browser.status(function (err) {
    if (err && /ECONNREFUSED/.test(err.message)) {
      if (++self.retry === self.maxRetries) {
        callback('[chimp][session-manager] timed out retrying to connect to selenium server');
      }
      log.debug('[chimp][session-manager] could not connect to the server, retrying', '(' + self.retry + '/' + self.maxRetries + ')');
      setTimeout(function() {
        self._waitForConnection(browser, callback);
      }, self.retryDelay);
    } else {
      callback();
    }
  });
};


SessionManager.prototype._monkeyPatchBrowserSessionManagement = function (browser, sessions) {

  log.debug('[chimp][session-manager]', 'monkey patching the browser object');

  var callbacker = function () {
    var cb = arguments[arguments.length - 1];
    if (cb && typeof cb === 'function') {
      cb();
    }
    return {
      then: function (c) {
        c();
      }
    };
  };

  browser._init = browser.init;
  browser.init = function () {
    if (sessions.length !== 0) {
      log.debug('[chimp][session-manager]', 'browser already initialized');
      return callbacker.apply(this, arguments);
    }
    log.debug('[chimp][session-manager]', 'initializing browser');
    return browser._init.apply(this, arguments);
  };

  browser._end = browser.end;
  browser.end = callbacker.bind(browser);

  browser._endAll = browser.end;
  browser.endAll = callbacker.bind(browser);

  return browser;

};

/**
 * Gets a list of sessions from the localhost selenium server
 *
 * @api public
 */
SessionManager.prototype._getWebdriverSessions = function (callback) {

  var wdHubSessions = 'http://localhost:' + this.options.port + '/wd/hub/sessions';

  log.debug('[chimp][session-manager]', 'requesting sessions from', wdHubSessions);

  request(wdHubSessions, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      log.debug('[chimp][session-manager]', 'received data', body);
      callback(null, JSON.parse(body).value);
    } else {
      log.error('[chimp][session-manager]', 'received error', error);
      callback(error);
    }
  });

};

module.exports = SessionManager;