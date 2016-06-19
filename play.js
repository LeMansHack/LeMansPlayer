var midi = require('midi');
var data = require('./dataexplorer.js');
var Client = require('node-rest-client').Client;
var myArgs = process.argv.slice(2);
var fs = require('graceful-fs');

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
        flag: [0,0,0],
        pitDriver: [0,0],
        driverChange: [0,0],
        lastTrack: false
    };

    this.midiNoteMapping = {
        speed: [1, 177],
        windDirection: [2, 177],
        windSpeed: [3, 177],
        changingPitStatus: [4, 177],
        pitOut: [5, 177],
        changingNumberOfPlaces: [6, 177],
        changingNumberOfDrivers: [7, 177],
        changingNumberOfWetDrivers: [8, 177],
        safetyCar: [9, 177],
        yellowFlag: [10, 177],
        takesTheLead: [11, 177],
        inPit: [12, 177],
        changingDriver: [13, 177],
        greenFlag: [14, 177],
        lazers: [15, 177]
    };

    this.tracksToStartFrom = [
        2,
        12,
        17,
        22,
        28,
        32,
        38,
        44,
        52,
        57,
        62,
        68,
        72,
        78,
        83,
        88,
        93,
        98
    ];

    this.currentSec = 0;
    this.firstTime = true;
    this.sendMidi = true;
    this.maxTracks = 101;
    this.maxTracksOverflow = true;

    this.changingPitStatus = false;
    this.changingOldPitOutStatus = false;
    this.changingNumberOfPlaces = false;
    this.changingNumberOfDrivers = false;
    this.changingNumberOfWetDrivers = false;

    this.live = true;
    this.spooling = false;
    this.mainInterval = null;

    this.endingMusicLab = 98;
    this.stopMusicLab = 106;

    this.saveFile = './playdata.json';
};

play.prototype.run = function() {
    var me = this;
    if(fs.existsSync(this.saveFile)) {
        console.log('Playing from ' + this.saveFile);
        var fileData = JSON.parse(fs.readFileSync(this.saveFile));
        for(var fi in fileData) {
            this.playData[fi] = fileData[fi];
        }
    }

    if(this.live == true) {
        var client = new Client();
       this.mainInterval = setInterval(function() {
            client.get('http://192.168.1.56:3000', function(data) {
                me.currentData = data;
                me.render();
            });
        }, 1000);
    } else {
        this.mainInterval = setInterval(function() {
            me.currentData = me.dataExplorer.getData(me.currentSec);
            me.render();
            me.currentSec += 1;
        }, 1);
    }

    var lastSendTrack = 1;
    var midiWorking = false;
    this.input.on('message', function(deltaTime, message) {
        console.log('I´VE RECIVE MIDI!!!');
        if(midiWorking) {
            return;
        }

        midiWorking = true;
        setTimeout(function() {
            midiWorking = false;
        }, 1000);

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

        if(me.playData.flag[0] == 4 && me.playData.lastTrack == false) { //Final lab
            console.log('Playing last track!');
            me.playData.musicLab = me.endingMusicLab;
            me.playData.lastTrack = true;
        }

        if(lastSendTrack != me.playData.musicLab) {
            if(me.maxTracksOverflow && me.playData.lastTrack == false) {
                for(var i in me.tracksToStartFrom) {
                    if((me.tracksToStartFrom[i] - 1) == lastSendTrack) {
                        me.playData.musicLab = me.tracksToStartFrom[Math.floor(Math.random() * me.tracksToStartFrom.length)];
                    }
                }
            }

            if(me.playData.musicLab > me.maxTracks && me.playData.lastTrack == false) {
                me.maxTracksOverflow = true;
                me.playData.musicLab = me.tracksToStartFrom[Math.floor(Math.random() * me.tracksToStartFrom.length)]
            }

            lastSendTrack = me.playData.musicLab;
            console.log('SENDING MIDI TO CHANGE TRACK TO ' + me.playData.musicLab);
            me.sendMidiNote(me.playData.musicLab);

            if(me.playData.lastTrack == true) {
                if(me.playData.musicLab >= me.stopMusicLab) {
                    console.log('THANK YOU FOR WATCHING!');
                    me.sendMidi = false;
                    clearInterval(me.mainInterval);
                } else {
                    me.playData.musicLab += 1;
                }
            }
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
        this.sendMidiNote(this.midiNoteMapping.windDirection[0], this.windDirectionToMidi(this.playData.windDirection[1]), this.midiNoteMapping.windDirection[1]);
    }

    this.playData.windSpeed[0] = this.currentData.track.weather.windSpeed;
    if(this.firstTime) {
        this.playData.windSpeed[2] = this.playData.windSpeed[1];
        this.playData.windSpeed[1] = this.playData.windSpeed[0];
        this.sendMidiNote(this.midiNoteMapping.windSpeed[0], this.windSpeedToMidi(this.playData.windSpeed[1]), this.midiNoteMapping.windSpeed[1]);
    }

    if(this.playData.speed[0] !== this.playData.speed[1] || this.firstTime) {
        console.log('Setting current speed to:' + this.playData.speed[0]);
        this.playData.speed[2] = this.playData.speed[1];
        this.playData.speed[1] = this.playData.speed[0];
        this.turnDaKnop(this.midiNoteMapping.speed[0], this.playData.speed[1], this.midiNoteMapping.speed[1], this.playData.speed[2], 100);
    }

    var me = this;
    //Pit status
    if(!this.changingPitStatus && this.playData.pitStatus[0] !== this.playData.pitStatus[1]) {
        console.log('Changing pit status to ' + this.playData.pitStatus[0]);
        this.changingPitStatus = true;
        this.turnDaKnop(this.midiNoteMapping.changingPitStatus[0], this.playData.pitStatus[0], this.midiNoteMapping.changingPitStatus[1], this.playData.pitStatus[1], 800, function(number) {
            me.changingPitStatus = false;
            me.playData.pitStatus[1] = number;
        });
    }

    //Pit out status
    if(!this.changingOldPitOutStatus && this.playData.pitOut[0] !== this.playData.pitOut[1]) {
        console.log('Changing pit out status to ' + this.playData.pitOut[1]);
        this.changingOldPitOutStatus = true;
        this.turnDaKnop(this.midiNoteMapping.pitOut[0], this.playData.pitOut[0], this.midiNoteMapping.pitOut[1], this.playData.pitOut[1], 800, function(number) {
            me.changingOldPitOutStatus = false;
            me.playData.pitOut[1] = number;
        });
    }

    //Place status
    if(!this.changingNumberOfPlaces && this.playData.numberOfPlaceChanges[0] !== this.playData.numberOfPlaceChanges[1]) {
        console.log('Changing number of place changes to ' + this.playData.numberOfPlaceChanges[0]);
        this.changingNumberOfPlaces = true;
        this.turnDaKnop(this.midiNoteMapping.changingNumberOfPlaces[0], this.playData.numberOfPlaceChanges[0], this.midiNoteMapping.changingNumberOfPlaces[1], this.playData.numberOfPlaceChanges[1], 800, function(numberSetTo) {
            console.log('Finished changing number of drivers');
            me.changingNumberOfPlaces = false;
            me.playData.numberOfPlaceChanges[1] = numberSetTo;
        });
    }

    //Number of driver change
    if(!this.changingNumberOfDrivers && this.playData.numberOfDriverChanges[0] != this.playData.numberOfDriverChanges[1]) {
        console.log('Changing number of driver changes to ' + this.playData.numberOfDriverChanges[0]);
        this.changingNumberOfDrivers = true;
        this.turnDaKnop(this.midiNoteMapping.changingNumberOfDrivers[0], this.playData.numberOfDriverChanges[0], this.midiNoteMapping.changingNumberOfDrivers[1], this.playData.numberOfDriverChanges[1], 800, function(number) {
            me.changingNumberOfDrivers = false;
            me.playData.numberOfDriverChanges[1] = number;
        });

        if(this.playData.numberOfDriverChanges[0] >= 50) {
            console.log('Fire lazers... Piv piv..');
            this.sendMidiNote(this.midiNoteMapping.lazers[0], 127, this.midiNoteMapping.lazers[1]);
        }
    }

    //Number of wet drivers
    if(!this.changingNumberOfWetDrivers && this.playData.numberOfWetTires[0] !== this.playData.numberOfWetTires[1]) {
        console.log('Changing number of wet tires drivers to ' + this.playData.numberOfWetTires[0]);
        this.changingNumberOfWetDrivers = true;
        this.turnDaKnop(this.midiNoteMapping.changingNumberOfWetDrivers[0], this.playData.numberOfWetTires[0], this.midiNoteMapping.changingNumberOfWetDrivers[1], this.playData.numberOfWetTires[1], 800, function(number) {
            me.changingNumberOfWetDrivers = false;
            me.playData.numberOfWetTires[1] = number;
        });
    }

    if(this.playData.lap !== this.playData.currentLab || this.firstTime) {
        if(this.playData.lastTrack == false) {
            this.playData.lap = this.playData.currentLab;
            console.log('Current lap:' + this.playData.currentLab);
            this.playData.musicLab += 1;
            console.log('Shifting music lap to: ' + this.playData.musicLab);
            if(this.firstTime) {
                this.sendMidiNote(this.playData.musicLab);
            }
        }
    }

    if(this.playData.pitDriver[0] > 0 && this.playData.pitDriver[0] != this.playData.pitDriver[1]) {
        this.playData.pitDriver[1] = this.playData.pitDriver[0];
        this.playCarNumber(this.playData.pitDriver[1]);
        this.sendMidiNote(this.midiNoteMapping.inPit[0], 127, this.midiNoteMapping.inPit[1], 2500);
    }

    if(this.playData.driverChange[0] > 0 && this.playData.driverChange[0] != this.playData.driverChange[1]) {
        this.playData.driverChange[1] = this.playData.driverChange[0];
        this.playCarNumber(this.playData.driverChange[0]);
        this.sendMidiNote(this.midiNoteMapping.changingDriver[0], 127, this.midiNoteMapping.changingDriver[1], 2500);
    }

    this.playData.frontCar[0] = this.currentData.cars[0].number;
    if(this.playData.frontCar[0] != this.playData.frontCar[1]) {
        this.playData.frontCar[1] = this.playData.frontCar[0];
        console.log('New car has overtaken!');
        this.playCarNumber(this.playData.frontCar[0]);
        this.sendMidiNote(this.midiNoteMapping.takesTheLead[0], 127, this.midiNoteMapping.takesTheLead[1], 2500);
    }

    this.playData.safetyCar[0] = this.currentData.track.safetyCar;
    if(this.playData.safetyCar[0] !== this.playData.safetyCar[1]) {
        this.playData.safetyCar[1] = this.playData.safetyCar[0];
        if(this.playData.safetyCar[0] == true) {
            this.sendMidiNote(this.midiNoteMapping.safetyCar[0], 127, this.midiNoteMapping.safetyCar[1]);
        }
    }

    this.playData.flag[0] = this.currentData.track.flag;
    if(this.playData.flag[0] !== this.playData.flag[1] && me.playData.lastTrack == false) {
        this.playData.flag[1] = this.playData.flag[0];
        switch(this.playData.flag[0]) {
            case 1:
                console.log('Track off car on track!');
                break;
            case 2:
                console.log('Green flag');
                this.sendMidiNote(this.midiNoteMapping.greenFlag[0], 127, this.midiNoteMapping.greenFlag[1]);
                break;
            case 3:
                console.log('Red flag');
                break;
            case 4:
                console.log('Chk flag');
                break;
            case 5:
                console.log('Yellow flag!');
                this.sendMidiNote(this.midiNoteMapping.yellowFlag[0], 127, this.midiNoteMapping.yellowFlag[1]);
                break;
            case 6:
                console.log('Full Yellow flag!');
                this.sendMidiNote(this.midiNoteMapping.yellowFlag[0], 127, this.midiNoteMapping.yellowFlag[1]);
                break;
        }
    }

    if(this.firstTime) {
        this.firstTime = false;
    }

    if(!this.spooling) {
        fs.writeFileSync(this.saveFile, JSON.stringify(this.playData));
    }
};

play.prototype.playCarNumber = function(carnumber) {
    console.log('Sound carnumber ' + carnumber );
    var me = this;
    setTimeout(function() {
        switch(carnumber) {
            case "1":
                me.sendMidiNote(1, 127, 178);
                break;
            case "2":
                me.sendMidiNote(2, 127, 178);
                break;
            case "4":
                me.sendMidiNote(4, 127, 178);
                break;
            case "5":
                me.sendMidiNote(5, 127, 178);
                break;
            case "6":
                me.sendMidiNote(6, 127, 178);
                break;
            case "7":
                me.sendMidiNote(7, 127, 178);
                break;
            case "8":
                me.sendMidiNote(8, 127, 178);
                break;
            case "12":
                me.sendMidiNote(12, 127, 178);
                break;
            case "13":
                me.sendMidiNote(13, 127, 178);
                break;
        }
    }, 500);
};

play.prototype.spool = function(musiclap) {
      this.sendMidi = false;
      this.spooling = true;
      while(this.playData.musicLab < musiclap) {
          this.currentData = this.dataExplorer.getData(this.currentSec);
          this.render();
          this.currentSec += 1;
      }

      this.firstTime = true;
      this.sendMidi = true;
      this.spooling = false;
      fs.writeFileSync(this.saveFile, JSON.stringify(this.playData));
};

play.prototype.sendMidiNote = function(note, value, channel, delay) {
    if(!this.sendMidi) {
        return;
    }

    if(!value) {
        value = 127;
    }

    if(!channel) {
        channel = 176;
    }

    if(delay) {
        var me = this;
        setTimeout(function() {
            console.log('Sending midi node: ' + note + ',' + value + ',' + channel);
            me.output.sendMessage([channel, note, value]);
        }, delay);
    } else {
        console.log('Sending midi node: ' + note + ',' + value + ',' + channel);
        this.output.sendMessage([channel, note, value]);
    }

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
            if(parseInt(cars[i].number) <= 13) {
                this.playData.pitDriver[0] = cars[i].number;
            }
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
                if(parseInt(cars[i].number) <= 13) {
                    this.playData.driverChange[0] = cars[i].number;
                }
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

    if(cars[0].lastTimeInMiliseconds) {
        var percent =  100000/(cars[0].lastTimeInMiliseconds);
        return Math.round(127*percent);
    }

    return this.playData.speed[1];
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


