var midi = require('midi');
var data = require('./dataexplorer.js');

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
};

play.prototype.run = function() {
    var me = this;
    var firstTime = true;

    setInterval(function() {
        me.currentData = me.dataExplorer.getData(me.currentSec);
        var currentLab =  me.getCurrentLab();
        var currentSpeed = me.getCurrentSpeed();

        if(me.currentSpeed !== currentSpeed) {
            console.log('Setting current speed to:' + currentSpeed);
            me.currentSpeed = currentSpeed;
            me.sendMidiNote(1, me.currentSpeed, 177);
        }

        if(me.currentLab !== currentLab) {
            me.currentLab = currentLab;
            console.log('Current lap:' + me.currentLab);
            me.currentMusicLab += 1;
            console.log('Shifting music lap to: ' + me.currentMusicLab);
            if(firstTime) {
                me.sendMidiNote(me.currentMusicLab);
                firstTime = false;
            }
        }

        me.currentSec += 1;
    }, 1);

    var lastSendTrack = 1;
    this.input.on('message', function(deltaTime, message) {
        if(lastSendTrack != me.currentMusicLab) {
            lastSendTrack = me.currentMusicLab;
            me.sendMidiNote(me.currentMusicLab);
        }
    });
};

play.prototype.sendMidiNote = function(note, value, channel) {
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
setTimeout(function() {
    play.run();
}, 10000);
