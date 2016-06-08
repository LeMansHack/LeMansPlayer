var midi = require('midi');
var data = require('./dataexplorer.js');
var myArgs = process.argv.slice(2);

var play = function() {
    this.currentData = null;
    this.currentSec = 0;
    this.dataExplorer = new data();

    this.currentMusicLab = 0;
    this.currentLab = -1;
    this.currentSpeed = 80;
    this.windDirection = 0;
    this.currentWindDirection = 0;

    this.currentWindSpeed = 0;
    this.windSpeed = 0;

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
        if(me.currentWindDirection != me.windDirection) {
            console.log('Changing windirection to ' + me.windDirection);
            me.windDirection = me.currentWindDirection;
            me.sendMidiNote(2, me.windDirectionToMidi(me.windDirection), 177);
        }

        if(me.currentWindSpeed != me.windSpeed) {
            console.log('Changing windspeed to ' + me.windSpeed);
            me.windSpeed = me.currentWindSpeed;
            me.sendMidiNote(3, me.windSpeedToMidi(me.windSpeed), 177);
        }

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

    this.currentWindDirection = this.currentData.track.weather.windDirection;
    if(this.firstTime) {
        this.windDirection = this.currentWindDirection;
        this.sendMidiNote(2, this.windDirectionToMidi(this.windDirection), 177);
    }

    this.currentWindSpeed = this.currentData.track.weather.windSpeed;
    if(this.firstTime) {
        this.windSpeed = this.currentData.track.weather.windSpeed;
        this.sendMidiNote(3, this.windSpeedToMidi(this.windSpeed), 177);
    }

    if(this.currentSpeed !== currentSpeed || this.firstTime) {
        console.log('Setting current speed to:' + currentSpeed);
        this.turnDaKnop(1, currentSpeed, 177, this.currentSpeed, 100);
        this.currentSpeed = currentSpeed;
    }

    if(this.currentLab !== currentLab || this.firstTime) {
        this.currentLab = currentLab;
        console.log('Current lap:' + this.currentLab);
        this.currentMusicLab += 1;
        console.log('Shifting music lap to: ' + this.currentMusicLab);
        if(this.firstTime) {
            this.sendMidiNote(this.currentMusicLab);
        }
    }

    this.currentSec += 1;
    if(this.firstTime) {
        this.firstTime = false;
    }
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

play.prototype.turnDaKnop = function(note, value, channel, oldValue, delay) {
    if(!delay) {
        delay = 500;
    }

    var self = this;
    var interVal = setInterval(function() {
        if(value != oldValue) {
            console.log('Turning da knop from ' + oldValue);
            oldValue = (oldValue < value) ? oldValue + 1 : oldValue - 1;
            console.log(oldValue);
            self.sendMidiNote(note, oldValue, channel);
        } else {
            console.log('Turning knop finaly to value ' + oldValue);
            self.sendMidiNote(note, oldValue, channel);
            clearInterval(interVal);
        }
    }, delay);
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

play.prototype.windDirectionToMidi = function(windirection) {
    var percent = windirection/360;
    return Math.round(127*percent);
};

play.prototype.windSpeedToMidi = function(windspeed) {
    var percent = windspeed/20;
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


