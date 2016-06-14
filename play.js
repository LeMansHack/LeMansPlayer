var midi = require('midi');
var data = require('./dataexplorer.js');
var myArgs = process.argv.slice(2);

var play = function() {
    this.currentData = null;
    this.currentSec = 0;
    this.dataExplorer = new data();
    this.oldCarData = [ ];

    this.currentMusicLab = 0;
    this.currentLab = -1;
    this.lap = 0;

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
    
    this.frontCar = 0;
    this.pitStatus = 0;
    this.oldPitStatus = 0;
    this.pitOut = 0;
    this.oldPitOut = 0;
    this.numberOfPlaceChanges = 0;
    this.oldNumberOfPlaceChanges = 0;
    this.numberOfDriverChanges = 0;
    this.oldNumberOfDriverChanges = 0;
    this.numberOfWetTires = 0;
    this.oldNumberOfWetTires = 0;

    this.running = 0;
    this.oldRunning = 0;

    this.safetyCar = false;

    this.changingNumberOfDrivers = false;
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
    this.readCars();
    var currentSpeed = this.getCurrentSpeed();
    this.safetyCar = this.currentData.track.safetyCar;

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

    var me = this;

    this.turnDaKnop(4, this.pitStatus, 177, this.oldPitStatus, 800);
    this.turnDaKnop(5, this.pitOut, 177, this.oldPitOut, 800);

    if(!this.changingNumberOfDrivers && this.oldNumberOfPlaceChanges != this.numberOfPlaceChanges) {
        console.log('Changing number of placechanges');
        this.changingNumberOfDrivers = true;
        this.turnDaKnop(6, this.numberOfPlaceChanges, 177, this.oldNumberOfPlaceChanges, 800, function(numberSetTo) {
            console.log('Finished changing number of drivers');
            me.changingNumberOfDrivers = false;
            me.oldNumberOfPlaceChanges = numberSetTo;
        });
    }

    this.turnDaKnop(7, this.numberOfDriverChanges, 177, this.oldNumberOfDriverChanges, 800);
    this.turnDaKnop(8, this.numberOfWetTires, 177, this.oldNumberOfWetTires, 800);

    this.oldPitStatus = this.pitStatus;
    this.oldPitOut = this.pitOut;
    this.oldNumberOfDriverChanges = this.numberOfDriverChanges;
    this.oldNumberOfWetTires = this.numberOfWetTires;

    if(this.lap !== this.currentLab || this.firstTime) {
        this.lap = this.currentLab;
        console.log('Current lap:' + this.currentLab);
        this.currentMusicLab += 1;
        console.log('Shifting music lap to: ' + this.currentMusicLab);
        if(this.firstTime) {
            this.sendMidiNote(this.currentMusicLab);
        }
    }
    
    if(this.frontCar != this.currentData.cars[0].number) { 
        //New car in front
    }

    switch(this.currentData.track.flag) {
        case 1:
            //Safety car
            break;
        case 2:
            //Yellow flag
            break;
        case 3:
            //Green flag
            break;
        case 4:
            //Red flag
            break;
        case 5:
            //chkFlag
            break;
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

play.prototype.turnDaKnop = function(note, value, channel, oldValue, delay, callback) {
    if(!delay) {
        delay = 500;
    }

    if(value == oldValue) {
        return;
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
            if(callback) {
                callback(oldValue);
            }
            clearInterval(interVal);
        }
    }, delay);
};

play.prototype.readCars = function() {
    var cars = this.currentData.cars;
    var accLabs = 0;
    var numberOfCars = cars.length;
    var pits = 0;
    var pitOut = 0;
    var numberOfCarChanges = 0;
    var numberOfDriverChanges = 0;
    var numberOfWetTires = 0;
    var running = 0;

    for(var i in cars) {
        accLabs += cars[i].laps;
        if(cars[i].driverStatus == 4) {
            pits += 1;
        }

        if(cars[i].driverStatus == 3) {
            pitOut += 1;
        }

        if(cars[i].driverStatus == 2) {
            running += 1;
        }

        if(cars[i].tires == 'W') {
            numberOfWetTires += 1;
        }

        if(this.oldCarData[i]) {
            if(cars[i].number !== this.oldCarData[i].number) {
                numberOfCarChanges += 1;
            }

            if(cars[i].driver !== this.oldCarData[i].driver) {
                numberOfDriverChanges += 1;
            }
        }

    }

    this.running = Math.round(127 * (running/numberOfCars)) + 1;
    this.pitStatus = Math.round(127 * (pits*2/numberOfCars)) + 1;
    this.pitOut = Math.round(127 * (pitOut*2/numberOfCars)) + 1;
    this.numberOfPlaceChanges = Math.round(127 * (numberOfCarChanges*10/numberOfCars)) + 1;
    this.numberOfDriverChanges = Math.round(127 * (numberOfDriverChanges*10/numberOfCars)) + 1;
    this.numberOfWetTires = Math.round(127 * (numberOfWetTires*3/numberOfCars)) + 1;
    this.currentLab = Math.abs(accLabs/numberOfCars).toFixed(1);
    this.oldCarData = cars;
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


