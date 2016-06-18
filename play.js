var midi = require('midi');
var data = require('./dataexplorer.js');
var Client = require('node-rest-client').Client;
var myArgs = process.argv.slice(2);

var play = function() {
    this.currentData = null;
    this.dataExplorer = new data();
    this.oldCarData = [ ];

    this.output = new midi.output();
    this.output.openVirtualPort("Test Output");
    this.input = new midi.input();
    this.input.openVirtualPort("Test input");

    //[0,0,0] => [liveValue, setValue, oldValue]
    this.playData = {
        musicLab: 0,
        currentSec: 0,
        currentLab: -1,
        lap: 0,
        speed: [80, 80, 0],
        windDirection: [0,0,0],
        windSpeed: [0,0,0],
        frontCar: [0,0,0],
        pitStatus: [0,0,0],
        pitOut: [0,0,0],
        numberOfPlaceChanges: [0,0,0],
        numberOfDriverChanges: [0,0,0],
        numberOfWetTires: [0,0,0],
        running: [0,0,0],
        safetyCar: [false, false, false],
        flag: [0,0,0]
    };

    this.firstTime = true;
    this.sendMidi = true;

    this.changingPitStatus = false;
    this.changingOldPitOutStatus = false;
    this.changingNumberOfPlaces = false;
    this.changingNumberOfDrivers = false;
    this.changingNumberOfWetDrivers = false;

    this.live = false;
    this.spooling = false;
};

play.prototype.run = function() {
    var me = this;
    if(this.live == true) {
        var client = new Client();
        setInterval(function() {
            client.get('http://localhost:3000', function(data) {
                me.currentData = data;
                me.render();
            });
        }, 1000);
    } else {
        setInterval(function() {
            me.currentData = me.dataExplorer.getData(me.playData.currentSec);
            me.render();
            me.playData.currentSec += 1;
        }, 1);
    }

    var lastSendTrack = 1;
    this.input.on('message', function(deltaTime, message) {
        if(me.playData.windDirection[0] != me.playData.windDirection[1]) {
            console.log('Changing windirection to ' + me.playData.windDirection[0]);
            me.playData.windDirection[2] = me.playData.windDirection[1];
            me.playData.windDirection[1] = me.playData.windDirection[0];
            me.sendMidiNote(2, me.windDirectionToMidi(me.playData.windDirection[1]), 177);
        }

        if(me.playData.windSpeed[0] != me.playData.windSpeed[1]) {
            console.log('Changing windspeed to ' + me.playData.windSpeed[0]);
            me.playData.windSpeed[2] = me.playData.windSpeed[1];
            me.playData.windSpeed[1] = me.playData.windSpeed[0];
            me.sendMidiNote(3, me.windSpeedToMidi(me.playData.windSpeed[1]), 177);
        }

        if(lastSendTrack != me.playData.currentMusicLab) {
            lastSendTrack = me.playData.currentMusicLab;
            me.sendMidiNote(me.playData.currentMusicLab);
        }
    });
};

play.prototype.render = function() {
    this.readCars();
    this.playData.speed[0] = this.getCurrentSpeed();
    this.playData.safetyCar[0] = this.currentData.track.safetyCar;

    this.playData.windDirection[0] = this.currentData.track.weather.windDirection;
    if(this.firstTime) {
        this.playData.windDirection[2] = this.playData.windDirection[1];
        this.playData.windDirection[1] = this.playData.windDirection[0];
        this.sendMidiNote(2, this.windDirectionToMidi(this.playData.windDirection[1]), 177);
    }

    this.playData.windSpeed[0] = this.currentData.track.weather.windSpeed;
    if(this.firstTime) {
        this.playData.windSpeed[2] = this.playData.windSpeed[1];
        this.playData.windSpeed[1] = this.playData.windSpeed[0];
        this.sendMidiNote(3, this.windSpeedToMidi(this.playData.windSpeed[1]), 177);
    }

    if(this.playData.speed[0] !== this.playData.speed[1] || this.firstTime) {
        console.log('Setting current speed to:' + this.playData.speed[0]);
        this.playData.speed[2] = this.playData.speed[1];
        this.playData.speed[1] = this.playData.speed[0];
        this.turnDaKnop(1, this.playData.speed[1], 177, this.playData.speed[2], 100);
    }

    var me = this;
    //Pit status
    if(!this.changingPitStatus && this.playData.pitStatus[0] !== this.playData.pitStatus[1]) {
        console.log('Changing pit status to ' + this.playData.pitStatus[0]);
        this.changingPitStatus = true;
        this.turnDaKnop(4, this.playData.pitStatus[0], 177, this.playData.pitStatus[1], 800, function(number) {
            me.changingPitStatus = false;
            me.playData.pitStatus[1] = number;
        });
    }

    //Pit out status
    if(!this.changingOldPitOutStatus && this.playData.pitOut[0] !== this.playData.pitOut[1]) {
        console.log('Changing pit out status to ' + this.playData.pitOut[1]);
        this.changingOldPitOutStatus = true;
        this.turnDaKnop(5, this.playData.pitOut[0], 177, this.playData.pitOut[1], 800, function(number) {
            me.changingOldPitOutStatus = false;
            me.playData.pitOut[1] = number;
        });
    }

    //Place status
    if(!this.changingNumberOfPlaces && this.playData.numberOfPlaceChanges[0] !== this.playData.numberOfPlaceChanges[1]) {
        console.log('Changing number of place changes to ' + this.playData.numberOfPlaceChanges[0]);
        this.changingNumberOfPlaces = true;
        this.turnDaKnop(6, this.playData.numberOfPlaceChanges[0], 177, this.playData.numberOfPlaceChanges[1], 800, function(numberSetTo) {
            console.log('Finished changing number of drivers');
            me.changingNumberOfPlaces = false;
            me.playData.numberOfPlaceChanges[1] = numberSetTo;
        });
    }

    //Number of driver change
    if(!this.changingNumberOfDrivers && this.playData.numberOfDriverChanges[0] != this.playData.numberOfDriverChanges[1]) {
        console.log('Changing number of driver changes to ' + this.playData.numberOfDriverChanges[0]);
        this.changingNumberOfDrivers = true;
        this.turnDaKnop(7, this.playData.numberOfDriverChanges[0], 177, this.playData.numberOfDriverChanges[1], 800, function(number) {
            me.changingNumberOfDrivers = false;
            me.playData.numberOfDriverChanges[1] = number;
        });
    }

    //Number of wet drivers
    if(!this.changingNumberOfWetDrivers && this.playData.numberOfWetTires[0] !== this.playData.numberOfWetTires[1]) {
        console.log('Changing number of wet tires drivers to ' + this.playData.numberOfWetTires[0]);
        this.changingNumberOfWetDrivers = true;
        this.turnDaKnop(8, this.playData.numberOfWetTires[0], 177, this.playData.numberOfWetTires[1], 800, function(number) {
            me.changingNumberOfWetDrivers = false;
            me.playData.numberOfWetTires[1] = number;
        });
    }

    if(this.playData.lap !== this.playData.currentLab || this.firstTime) {
        this.playData.lap = this.playData.currentLab;
        console.log('Current lap:' + this.playData.currentLab);
        this.playData.musicLab += 1;
        console.log('Shifting music lap to: ' + this.playData.musicLab);
        if(this.firstTime) {
            this.sendMidiNote(this.playData.musicLab);
        }
    }

    this.playData.frontCar[0] = this.currentData.cars[0].number;
    if(this.playData.frontCar[1] != this.playData.frontCar[1]) {
        console.log('New car has overtaken!');
    }

    this.playData.flag[0] = this.currentData.track.flag;
    if(this.playData.flag[0] !== this.playData.flag[1] || this.firstTime) {
        this.playData.flag[1] = this.playData.flag[0];
        switch(this.currentData.track.flag) {
            case 1:
                console.log('Safety car on track!');
                break;
            case 2:
                console.log('Yellow flag');
                break;
            case 3:
                console.log('Green flag');
                break;
            case 4:
                console.log('Red flag');
                break;
            case 5:
                console.log('Chk flag');
                break;
        }
    }

    if(this.firstTime) {
        this.firstTime = false;
    }
};

play.prototype.spool = function(musiclap) {
      this.sendMidi = false;
      this.spooling = true;
      while(this.playData.musicLab < musiclap) {
          this.currentData = this.dataExplorer.getData(this.playData.currentSec);
          this.render();
          this.playData.currentSec += 1;
      }

      this.firstTime = true;
      this.sendMidi = true;
      this.spooling = false;
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
    if(self.spooling == true) {
        console.log('Spool to value ' + value);
        if(callback) {
            callback(value);
        }
        return;
    }

    var interVal = setInterval(function() {
        if(value != oldValue) {
            console.log('Turning da knop from ' + oldValue);
            oldValue = (oldValue < value) ? oldValue + 1 : oldValue - 1;
            console.log('to ' + oldValue);
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

    this.playData.running[0] = Math.round(127 * (running/numberOfCars)) + 1;
    this.playData.pitStatus[0] = Math.round(127 * (pits*2/numberOfCars)) + 1;
    this.playData.pitOut[0] = Math.round(127 * (pitOut*2/numberOfCars)) + 1;
    this.playData.numberOfPlaceChanges[0] = Math.round(127 * (numberOfCarChanges*10/numberOfCars)) + 1;
    this.playData.numberOfDriverChanges[0] = Math.round(127 * (numberOfDriverChanges*10/numberOfCars)) + 1;
    this.playData.numberOfWetTires[0] = Math.round(127 * (numberOfWetTires*3/numberOfCars)) + 1;
    this.playData.currentLab = Math.abs(accLabs/numberOfCars).toFixed(1);
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


