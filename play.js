let midi = require('midi');
let data = require('lemandataexplorer');
let Client = require('node-rest-client').Client;
let myArgs = process.argv.slice(2);
let fs = require('graceful-fs');
let abletonApi = require('abletonapi');
let TWEEN = require('tween.js');

class Player {
    constructor() {
        this.currentData = null;
        this.dataExplorer = new data();
        this.oldCarData = [ ];

        this.output = new midi.output();
        this.output.openVirtualPort("Test Output");
        this.input = new midi.input();
        this.input.openVirtualPort("Test input");

        //[0,0,0] => [liveValue, setValue, oldValue]
        this.playData = {
            musicLab: -1,
            currentLab: -1,
            lap: 0,
            speed: [120, 120, 0],
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

        this.tracksToStartFrom = [ ];
        this.scenes = { };

        this.currentSec = 0;
        this.firstTime = true;
        this.sendMidi = true;
        this.maxTracks = 0;
        this.maxTracksOverflow = false;

        this.changingPitStatus = false;
        this.changingOldPitOutStatus = false;
        this.changingNumberOfPlaces = false;
        this.changingNumberOfDrivers = false;
        this.changingNumberOfWetDrivers = false;

        this.live = false;
        this.spooling = false;
        this.mainInterval = null;

        this.endingMusicLab = 98;
        this.stopMusicLab = 106;

        this.saveFile = './playdata.json';

        this.lastSendTrack = 1;
        this.midiWorking = false;
    }

    /**
     * Start the music loop
     */
    run() {
        setInterval(() => {
            TWEEN.update();
        }, 100);

        this.parseAbletonData().then(() => {
            if(fs.existsSync(this.saveFile)) {
                console.log('Playing from ' + this.saveFile);
                let fileData = JSON.parse(fs.readFileSync(this.saveFile));
                for(let fi in fileData) {
                    this.playData[fi] = fileData[fi];
                }
            }

            if(this.live === true) {
                let client = new Client();
                this.mainInterval = setInterval(() => {
                    client.get('http://192.168.1.56:3000', (data) => {
                        this.currentData = data;
                        this.render();
                    });
                }, 1000);
            } else {
                this.mainInterval = setInterval(() => {
                    this.currentData = this.dataExplorer.getData(this.currentSec);
                    this.render();
                    this.currentSec += 1;
                }, 1);
            }

            //Setup MIDI listener
            this.input.on('message', () => { this.onMidiNote() });
        });
    }

    onMidiNote() {
        console.log('I´VE RECIVE MIDI!!!');
        if(this.midiWorking) {
            return;
        }

        this.midiWorking = true;
        setTimeout(() => {
            this.midiWorking = false;
        }, 1000);

        if(this.playData.windDirection[0] !== this.playData.windDirection[1]) {
            console.log('Changing windirection to ' + this.playData.windDirection[0]);
            this.playData.windDirection[2] = this.playData.windDirection[1];
            this.playData.windDirection[1] = this.playData.windDirection[0];
            this.sendMidiNote(2, this.windDirectionToMidi(this.playData.windDirection[1]), 177);
        }

        if(this.playData.windSpeed[0] !== this.playData.windSpeed[1]) {
            console.log('Changing windspeed to ' + this.playData.windSpeed[0]);
            this.playData.windSpeed[2] = this.playData.windSpeed[1];
            this.playData.windSpeed[1] = this.playData.windSpeed[0];
            this.sendMidiNote(3, this.windSpeedToMidi(this.playData.windSpeed[1]), 177);
        }

        if(this.playData.flag[0] === 4 && this.playData.lastTrack === false) { //Final lab
            console.log('Playing last track!');
            this.playData.musicLab = this.endingMusicLab;
            this.playData.lastTrack = true;
        }

        if(this.lastSendTrack !== this.playData.musicLab) {
            if(this.maxTracksOverflow && this.playData.lastTrack === false) {
                for(let i in this.tracksToStartFrom) {
                    if((this.tracksToStartFrom[i] - 1) === this.lastSendTrack) {
                        this.playData.musicLab = this.tracksToStartFrom[Math.floor(Math.random() * this.tracksToStartFrom.length)];
                    }
                }
            }

            if(this.playData.musicLab > this.maxTracks && this.playData.lastTrack === false) {
                this.maxTracksOverflow = true;
                this.playData.musicLab = this.tracksToStartFrom[Math.floor(Math.random() * this.tracksToStartFrom.length)]
            }

            this.lastSendTrack = this.playData.musicLab;
            console.log('SENDING MIDI TO CHANGE TRACK TO ' + this.playData.musicLab);
            abletonApi.playScene(this.playData.musicLab);

            if(this.playData.lastTrack === true) {
                if(this.playData.musicLab >= this.stopMusicLab) {
                    console.log('THANK YOU FOR WATCHING!');
                    this.sendMidi = false;
                    clearInterval(this.mainInterval);
                } else {
                    this.playData.musicLab += 1;
                }
            }
        }
    }

    /**
     * Reads static data from ableton
     * @returns {Promise.<TResult>}
     */
    parseAbletonData() {
        return abletonApi.getScenes().then((scenes) => {
            this.scenes = scenes.filter((scene) => {
               return (scene.name.match(/^[0-9][0-9]/gi));
            });

            this.maxTracks = this.scenes.length;

            let lastName = null;
            this.tracksToStartFrom = this.scenes.filter((track) => {
               let check = (track.name != lastName);
               lastName = track.name;
               return check;
            }).map((track) => {
                return track.id
            });
        });
    }

    /**
     * Sets BPM of track by the current speed of cars
     */
    setTrackBPM() {
        if(!this.settingTrackBpm) {
            this.settingTrackBpm = true;
            let speed = this.getCurrentSpeed();
            abletonApi.getTempo().then((tempo) => {
                if(speed.toFixed(2) !== tempo.toFixed(2)) {
                    this.turnDaKnopBetter({speed: tempo.toFixed(2)}, {speed: speed.toFixed(2)}, 5000, (object) =>  {
                        abletonApi.setTempo(object.speed.toFixed(2));
                    }, () => {
                        this.settingTrackBpm = false;
                    });
                } else {
                    this.settingTrackBpm = false;
                }
            });
        }
    }

    render() {
        this.readCars();
        this.setTrackBPM(); //Sets track BPM

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

        let me = this;
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
            if(this.playData.lastTrack === false) {
                this.playData.lap = this.playData.currentLab;
                console.log('Current lap:' + this.playData.currentLab);
                this.playData.musicLab += 1;
                console.log('Shifting music lap to: ' + this.playData.musicLab);
                if(this.firstTime) {
                    abletonApi.playScene(this.playData.musicLab);
                }
            }
        }

        if(this.playData.pitDriver[0] > 0 && this.playData.pitDriver[0] != this.playData.pitDriver[1]) {
            this.playData.pitDriver[1] = this.playData.pitDriver[0];
            this.playCarNumber(this.playData.pitDriver[1]);
            this.sendNote(this.midiNoteMapping.inPit[0], 127, this.midiNoteMapping.inPit[1], 3000);
        }

        if(this.playData.driverChange[0] > 0 && this.playData.driverChange[0] != this.playData.driverChange[1]) {
            this.playData.driverChange[1] = this.playData.driverChange[0];
            this.playCarNumber(this.playData.driverChange[0]);
            this.sendMidiNote(this.midiNoteMapping.changingDriver[0], 127, this.midiNoteMapping.changingDriver[1], 3000);
        }

        this.playData.frontCar[0] = this.currentData.cars[0].number;
        if(this.playData.frontCar[0] != this.playData.frontCar[1]) {
            this.playData.frontCar[1] = this.playData.frontCar[0];
            console.log('New car has overtaken!');
            this.playCarNumber(this.playData.frontCar[0]);
            this.sendMidiNote(this.midiNoteMapping.takesTheLead[0], 127, this.midiNoteMapping.takesTheLead[1], 3000);
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

    playCarNumber(carnumber) {
        console.log('Sound carnumber ' + carnumber );
        let me = this;
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

    spool(musiclap) {
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

    sendMidiNote(note, value, channel, delay) {
        if(!this.sendMidMidii) {
            return;
        }

        if(!value) {
            value = 127;
        }

        if(!channel) {
            channel = 176;
        }

        if(delay) {
            let me = this;
            setTimeout(function() {
                //console.log('Sending midi node: ' + note + ',' + value + ',' + channel);
                me.output.sendMessage([channel, note, value]);
            }, delay);
        } else {
            //console.log('Sending midi node: ' + note + ',' + value + ',' + channel);
            this.output.sendMessage([channel, note, value]);
        }

    };

    turnDaKnopBetter(from, to, time, update, complete) {
        return new TWEEN.Tween(from)
            .to(to, time)
            .onUpdate(function() {
                update(this);
            }).onComplete(complete)
            .start();
    }

    turnDaKnop(note, value, channel, oldValue, delay, callback) {
        if(!delay) {
            delay = 500;
        }

        if(value == oldValue) {
            return;
        }

        let self = this;
        if(self.spooling == true) {
            console.log('Spool to value ' + value);
            if(callback) {
                callback(value);
            }
            return;
        }

        let interVal = setInterval(function() {
            if(value != oldValue) {
                //console.log('Turning da knop from ' + oldValue);
                oldValue = (oldValue < value) ? oldValue + 1 : oldValue - 1;
                //console.log('to ' + oldValue);
                self.sendMidiNote(note, oldValue, channel);
            } else {
                //console.log('Turning knop finaly to value ' + oldValue);
                self.sendMidiNote(note, oldValue, channel);
                if(callback) {
                    callback(oldValue);
                }
                clearInterval(interVal);
            }
        }, delay);
    };

    readCars() {
        let cars = this.currentData.cars;
        let accLabs = 0;
        let numberOfCars = cars.length;
        let pits = 0;
        let pitOut = 0;
        let numberOfCarChanges = 0;
        let numberOfDriverChanges = 0;
        let numberOfWetTires = 0;
        let running = 0;

        for(let i in cars) {
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

    getCurrentSpeed() {
        let cars = this.currentData.cars;

        if(cars[0].lastTimeInMiliseconds) {
            let percent =  100000/(cars[0].lastTimeInMiliseconds);
            return Math.round(230*percent);
        }

        return this.playData.speed[1];
    };

    windDirectionToMidi(windirection) {
        let percent = windirection/360;
        return Math.round(127*percent);
    };

    windSpeedToMidi(windspeed) {
        let percent = windspeed/20;
        return Math.round(127*percent);
    };
}

let PlayObject = new Player();
PlayObject.run();
/*if(myArgs[0] && myArgs[0].length > 0) {
    console.log('Sppoling to lap ' + myArgs[0]);
    PlayObject.spool(myArgs[0]);
    console.log('Playing lap ' + myArgs[0]);
    PlayObject.run();
} else {
    console.log('Please wait 10 sec for MIDI driver to init...');
    setTimeout(function() {
        console.log('Starting MIDI playback...');
        PlayObject.run();
    }, 10000);
}*/
