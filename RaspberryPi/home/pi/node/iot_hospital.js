// DeviceID
var DEVICEID_SELF = 'ID01'; 
var DEVICEID_PEER = 'ID02'; 

// Milkcocoa ID
var MILKCOCOA_APP_ID = 'dogi░░░░░░.mlkcca.com';
var MILKCOCOA_DATASTORE = 'messages';

// SendGrid ID
var SENDGRID_API_KEY = 'SG.sagWm3AnToyYqVHghcW░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░';

// Email parameters
var MAILFROM     = 'hoge1@example.com';
var MAILFROMNAME = 'iot_hospital';
var MAILTOs      = ['hoge2@example.com'];
var MAILCCs      = [];
var MAILSUBJECT  = 'ベッドより';
var URL          = 'http://www.░░░░░░░░░░░░/░░░░░░░░/iot_hospital/index.html?ID02&ID01';

// Modules
var milkcocoa = require('milkcocoa');
var sendgrid = require('sendgrid')(SENDGRID_API_KEY);
var gpio = require('onoff').Gpio;
var exec = require('child_process').exec;

// GPIO
var pin_LED_run = 4;
var pin_buttons = [13, 19, 26, 16, 20, 21, 6];
var pin_LEDsSelf = [10, 9, 11, 25, 5, 12];
var pin_LEDsPeer = [17, 27, 22, 18, 23, 24];
var LED_run;
var LEDsSelf = [];
var LEDsPeer = [];
var buttons = [];
var num_LEDs = pin_LEDsSelf.length;
var num_buttons = pin_buttons.length;

var milkcca = null;
var milkcca_ds;
var timer = null;
var pressedTime;
var edge_prev = 1;

main();

function _log(msg) {
  return console.log(getDateTimeString() + ' ' + msg);
}

function setButtonPin(idx) {
  _log('setButtonPin: idx=' + idx);
  buttons[idx] = new gpio(pin_buttons[idx], 'in', 'both');
  var cmd = 'gpio -g mode ' + pin_buttons[idx] + ' up';
  exec(cmd, function(error, stdout, stderr) {
    if (error !== null) {
      _log(error);
    }
  });
}

function setLedPin(idx) {
  _log('setLedPin: idx=' + idx);
  LEDsSelf[idx] = new gpio(pin_LEDsSelf[idx], 'out');
  LEDsSelf[idx].writeSync(0);
  LEDsPeer[idx] = new gpio(pin_LEDsPeer[idx], 'out');
  LEDsPeer[idx].writeSync(0);
}

function turnOnSelfLED(idx) {
  // turn off all
  for (i = 0; i < num_LEDs; i++) {
    LEDsSelf[i].writeSync(0);
  }
  // turn on
  if (idx != -1) {
    LEDsSelf[idx].writeSync(1);
  }
}

function turnOnPeerLED(idx) {
  for (i = 0; i < num_LEDs; i++) {
    LEDsPeer[i].writeSync(0);
  }
  if (idx != -1) {
    LEDsPeer[idx].writeSync(1);
  }
}

function clearTimer() {
  clearInterval(timer);
  timer = null;
}

function doSend(idx)
{
  // send milkcocoa message
  milkcca_ds.send({'to': DEVICEID_PEER, 'from' : DEVICEID_SELF, 'val' : idx});

  // send Email with inline picture
  var email = new sendgrid.Email({
    to: MAILTOs, cc: MAILCCs, from: MAILFROM, fromname: MAILFROMNAME,
    subject: MAILSUBJECT + ' (' + getDateTimeString() + ')',
    html: '<html><body><img src="cid:embedImage1"/>' +
          '<p><a href="' + url + '?' + DEVICEID_PEER + '&' + DEVICEID_SELF +
          '">ブラウザからメッセージを送る</body></html>',
    files: [
      {
        filename: idx + '.jpg',
        contentType: 'image/jpeg',
        cid: 'embedImage1',
        path: __dirname + '/img/' + idx + '.jpg',
      }
    ]
  });

  sendgrid.send(email, function(err, json) {
    if (err) {
      return _log('send mail : ERR ' + err);
    }
    _log('send mail : OK ' + JSON.stringify(json));
  });
  _log('send message: button=' + idx);
}

function buttonHandler(buttonId, err, val)
{
  if (err) {
    return _log('handler: ERR=' + err);
  }
  // suppress noise
  if (val == edge_prev) {
    return;
  }
  edge_prev = val;

  if (val == 0) { // Low
    pressedTime = Date.now();
  } else { // Hi
    var now = Date.now();
    if (now - pressedTime < 500) {
      // need long press
      return;
    }
    _log('handler: pressed button[' + buttonId + ']');

    if (buttonId == 6) { // special button
      // shutdown
      if (now - pressedTime > 5000) { // pressed for 5 seconds more
        doCleanup();
        exec('shutdown -h now', function(error, stdout, stderr) {
          if (error !== null) {
            _log('handler: shutdown ERR='+ error);
          }
        });
        return;
      }
      // turn off all LEDs
      turnOnSelfLED(-1);
      if (timer != null) {
        clearTimer();
      }
      turnOnPeerLED(-1);
    } else { // other button
      turnOnSelfLED(buttonId);
      doSend(buttonId);
    }
  }
}

function doCleanup() {
  if (milkcca != null) {
    milkcca.logout();
  }
  turnOnSelfLED(-1);
  turnOnPeerLED(-1);
  for (i = 0; i < num_LEDs; i++) {
    LEDsSelf[i].unexport();	
    LEDsPeer[i].unexport();	
    _log('doCleanup: unexport LED ' + i);
  }
  for (i = 0; i < num_buttons; i++) {
    buttons[i].unexport();	
    _log('doCleanup: unexport button ' + i);
  }
  LED_run.writeSync(0);
  LED_run.unexport();
}

function dd(val) {
  return ('0'+ val).slice(-2);
}

function getDateTimeString() {
  var now = new Date(); 
  var y = now.getFullYear();
  var m = now.getMonth()+1;
  var d = now.getDate();
  var h = now.getHours();
  var mn = now.getMinutes();
  var s = now.getSeconds();
  return  y + '-' + dd(m) + '-' + dd(d) + ' ' +
          dd(h) + ':' + dd(mn) + ':' + dd(s);
}

function doExit() {
  doCleanup();
  process.exit();
}

function main() {
  _log('init');

  // milkcocoa
  milkcca = new milkcocoa(MILKCOCOA_APP_ID);
  milkcca_ds = milkcca.dataStore(MILKCOCOA_DATASTORE);

  // pilot lamp off
  LED_run = new gpio(pin_LED_run, 'out');
  LED_run.writeSync(0);

  // init gpio pins
  for (i = 0; i < num_LEDs; i++) {
    setLedPin(i);
  }
  for (i = 0; i < num_buttons; i++) {
    setButtonPin(i);
  }

  // process termination handler
  process.on('SIGINT', doExit);

  // button event handlers
  for (i = 0; i < num_buttons; i++) {
    eval('buttons[' + i + '].watch(function (err, value) {' +
         'buttonHandler(' + i + ', err, value); });');
  }

  // milkcocoa message recv handler
  milkcca_ds.on('send', function(sended) {
    if (sended.value.to == DEVICEID_SELF) {
      var idx = sended.value.val;
      _log('recv message: button=' + idx);
      if (timer != null) {
        clearTimer();
      }
      turnOnPeerLED(-1);
      timer = setInterval(function(){
        LEDsPeer[idx].writeSync(LEDsPeer[idx].readSync() === 0 ? 1 : 0)
      }, 2000);
    }
  });

  _log('start');
  // pilot lamp on
  LED_run.writeSync(1);
}
