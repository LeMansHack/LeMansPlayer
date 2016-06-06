var midi = require('midi');
var data = require('./dataexplorer.js');
var myArgs = process.argv.slice(2);

var play = function() {
    this.currentData = null;
    this.currentSec = 0;
    this.dataExplorer = new data();

    this.currentMusicLab = 0;
    this.currentLab = -1;
    this.currentSpeed = 0;

    this.note = 0;
    this.value = 127;

    this.output = new midi.output();
    this.output.openVirtualPort("Test Output");
    this.input = new midi.input();
    this.input.openVirtualPort("Test input");

    this.firstTime = true;
    this.sendMidi = true;
};

play.prototype.run = function() {
    var me = this;
    setInterval(function() {
        me.render();
    }, 1);

    var lastSendTrack = 1;
    this.input.on('message', function(deltaTime, message) {
        if(lastSendTrack != me.currentMusicLab) {
            lastSendTrack = me.currentMusicLab;
            me.sendMidiNote(me.currentMusicLab);
        }
    });
};

play.prototype.render = function() {
    this.currentData = this.dataExplorer.getData(this.currentSec);
    var currentLab =  this.getCurrentLab();
    var currentSpeed = this.getCurrentSpeed();

    if(this.currentSpeed !== currentSpeed || this.firstTime) {
        console.log('Setting current speed to:' + currentSpeed);
        this.currentSpeed = currentSpeed;
        this.sendMidiNote(1, this.currentSpeed, 177);
    }

    if(this.currentLab !== currentLab || this.firstTime) {
        this.currentLab = currentLab;
        console.log('Current lap:' + this.currentLab);
        this.currentMusicLab += 1;
        console.log('Shifting music lap to: ' + this.currentMusicLab);
        if(this.firstTime) {
            this.sendMidiNote(this.currentMusicLab);
            this.firstTime = false;
        }
    }

    this.currentSec += 1;
};

play.prototype.spool = function(musiclap) {
      this.sendMidi = false;
      while(this.currentMusicLab < musiclap) {
          this.render();
      }

      this.firstTime = true;
      this.sendMidi = true;
};

play.prototype.sendMidiNote = function(note, value, channel) {
    if(!this.sendMidi) {
        return;
    }

    if(!value) {
        value = 127;
    }

    if(!channel) {
        channel = 176;
    }

    console.log('Sending midi node: ' + note);
    console.log('Sending midi value: ' + value);
    console.log('Sending midi channel: ' + channel);
    this.output.sendMessage([channel, note, value]);
};

play.prototype.getCurrentLab = function() {
    var cars = this.currentData.cars;
    var accLabs = 0;
    var numberOfCars = cars.length;

    for(var i in cars) {
        accLabs += cars[i].laps;
    }

    return Math.abs(accLabs/numberOfCars).toFixed(1);
};

play.prototype.getCurrentSpeed = function() {
    var cars = this.currentData.cars;
    
    var percent =  (cars[0].lastTimeInMiliseconds)/270000;
    return Math.round(127*percent);
};

var play = new play();
if(myArgs[0] && myArgs[0].length > 0) {
    console.log('Sppoling to lap ' + myArgs[0]);
    play.spool(myArgs[0]);
    console.log('Playing lap ' + myArgs[0]);
    play.run();
} else {
    console.log('Please wait 10 sec for MIDI driver to init...');
    setTimeout(function() {
        console.log('Starting MIDI playback...');
        play.run();
    }, 10000);
}


