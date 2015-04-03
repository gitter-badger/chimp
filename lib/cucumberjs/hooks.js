module.exports = function () {

  var fs = require('fs'),
      path = require('path'),
      SauceLabs = require('saucelabs');

  var passed = true;

  /**
   * Setup before each feature
   *
   * @param {Function} event
   * @param {Function} callback
   */
  this.Before(function (event, callback) {
    // initialize webdriver session
    global.browser.init(function () {
      var sessionID = this.requestHandler.sessionID;
      this.timeoutsAsyncScript(parseInt(process.env['cuker.timeoutsAsyncScript']));
      // load cuker webdriver configuration
      var configPath = path.resolve(process.cwd(), process.env['cuker.path'], 'cuker.js');
      if (fs.existsSync(configPath)) {
        global.browser = require(configPath)(this);
      }

      // helper method for sending test results to SauceLabs
      global.browser.addCommand('sauceJobStatus', function (status, done) {
        var sauceAccount = new SauceLabs({
          username: process.env['cuker.user'] || process.env.SAUCE_USERNAME,
          password: process.env['cuker.key'] || process.env.SAUCE_ACCESS_KEY
        });
        sauceAccount.updateJob(sessionID, status, done);
      });

      callback();

    });
  });

  /**
   * Cleanup after each feature
   *
   * @param {Function} event
   * @param {Function} callback
   */
  this.After(function (event, callback) {
    global.browser
      .end()
      .then(callback);
  });

  /**
   * Store browser test status so we can notify SauceLabs
   *
   * @param {Function} event
   * @param {Function} callback
   */
  this.StepResult(function (event, callback) {
    var stepResult = event.getPayloadItem('stepResult');
    passed = stepResult.isSuccessful() && passed;
    callback();
  });

  /**
   * After features have run we close the browser and optionally notify
   * SauceLabs
   *
   * @param {Function} event
   * @param {Function} callback
   */
  this.registerHandler('AfterFeatures', function (event, callback) {
    if (process.env['cuker.host'].toString().match(/saucelabs/)) {
      global.browser
        .sauceJobStatus({
          passed: passed,
          public: true
        })
        .end()
        .then(callback);
    } else {
      global.browser
        .end()
        .then(callback);
    }
  });
};