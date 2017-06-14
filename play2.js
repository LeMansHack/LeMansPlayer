let midi = require('midi');
let data = require('lemandataexplorer');
let Client = require('node-rest-client').Client;
let myArgs = process.argv.slice(2);
let fs = require('graceful-fs');
let abletonApi = require('abletonapi');
let TWEEN = require('tween.js');

class Player {
    constructor() {
        //DataExplorer library for offline test
        this.dataExplorer = new data();

        //MIDI setup
        this.output = new midi.output();
        this.output.openVirtualPort("Test Output");
        this.input = new midi.input();
        this.input.openVirtualPort("Test input");

        //Ableton Data
        this.scenes = [ ]; //Contains all Ableton Scenes
        this.maxTracks = 0; //Max numbers of tracks registered
        this.tracksToStartFrom = [ ]; //List of track ID´s of tracks to start from

        //Application data
        this.mainInterval = null; //Main loop
        this.currentData = null; //Object containing current loaded data
        this.oldCarData = { }; //Object containing data of car positions in last update
        this.firstTime = true; //Tells if we area rendering the first loop


        //File data
        this.saveFile = './playdata2.json'; //File to save playdata to
        this.chkValues = { }; //Object containing data on checked values
        this.playData = { //Object containing current loaded playdata

        };

        //MIDI data
        this.midiWorking = false; //Check if MIDI is currently in use

        //Enviroment data
        this.live = false; //Set to true if track is running live
        this.config = {};
        this.configModDate = null;
        this.configUpdate = false;
    }

    /**
     * Main Loop Starter
     */
    run() {
        setInterval(() => {
            TWEEN.update();
        }, 100);

        this.parseAbletonData().then(() => {
            if(fs.existsSync(this.saveFile)) {
                console.log('Playing from ' + this.saveFile);
                let fileData = JSON.parse(fs.readFileSync(this.saveFile));
                this.playData = fileData.playData;
                this.chkValues = fileData.chkValues;
            }

            if(this.live === true) {
                let client = new Client();
                this.mainInterval = setInterval(() => {
                    client.get('http://localhost:3000', (data) => {
                        this.currentData = data;
                        this.render();

                        if(this.firstTime) {
                            this.onMidiNote();
                            this.firstTime = false;
                        }
                    });
                }, 1000);
            } else {
                let data = null;
                let currentSec =  0;
                setInterval(() => {
                    data = this.dataExplorer.getData(currentSec);
                    this.setPlayData('currentSec', currentSec + 1);
                    currentSec += 1;
                }, 1);

                this.mainInterval = setInterval(() => {
                    this.currentData = data;
                    this.render();

                    if(this.firstTime) {
                        this.onMidiNote();
                        this.firstTime = false;
                    }
                }, 1000);
            }

            //Setup MIDI listener
            this.input.on('message', () => { this.onMidiNote() });
        });
    }

    /**
     * Reads static data from ableton
     * @returns {Promise.<TResult>}
     */
    parseAbletonData() {
        console.log('Parsing ableton data...');
        //abletonApi.getParametersForDevice(3, 0).then((data) => {
        //   console.log('paramereter data', data);
        //});

        return abletonApi.getScenes().then((scenes) => {
            console.log('Ableton data parsed!');
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

    onMidiNote() {
        if(this.midiWorking) {
            return;
        }

        this.midiWorking = true;
        setTimeout(() => {
            this.midiWorking = false;
        }, 1000);

        console.log('I´VE RECIVE MIDI!!!');
        this.setDrums();
        this.setCurrentPlayingTrack(); //Sets current playing track
    }

    /**
     * Sets current playing track
     */
    setCurrentPlayingTrack() {
        if(this.getPlayData('flag') === 4 && !this.getPlayData('lastTrack')) {
            console.log('Playing last track!');
            this.setPlayData('lastTrack', true);
            this.setPlayData('musicLab', this.config.endingMusicTrack - 1);
        }

        if(this.firstTime && this.getPlayData('musicLab')) {
            abletonApi.playScene(this.getPlayData('musicLab'));
        }

        if(this.checkPlayDataChange('currentLab', 'musicLabChk')) {
            abletonApi.playScene(this.nextTrack());
        }
    }

    /**
     * Advance musicLab by 1 and returns it
     * @returns {*}
     */
    nextTrack() {
        let currentTrack = this.getPlayData('musicLab', -1);
        let nextTrack = currentTrack + 1;
        if(((nextTrack > this.maxTracks) || this.config.trackOverflow) && !this.getPlayData('maxTracksOverflow')) {
            console.log('Track overflow enabled!');
            this.setPlayData('maxTracksOverflow', true);
        }

        if(this.getPlayData('maxTracksOverflow') && !this.getPlayData('lastTrack')) {
            for(let i in this.tracksToStartFrom) {
                if((this.tracksToStartFrom[i] - 1) === currentTrack) {
                    nextTrack = this.tracksToStartFrom[Math.floor(Math.random() * this.tracksToStartFrom.length)];
                }
            }
        }

        console.log('Playing track', nextTrack);
        this.setPlayData('musicLab', nextTrack);
        return nextTrack;
    }

    /**
     * Main loop for taking actions on data
     */
    render() {
        this.readConfig();
        if(this.configUpdate) {
            this.onMidiNote();
        }
        this.readCars();
        this.readTrackData();
        this.readFlagStatus();
        this.setTrackBpm();
        this.updateFile();
        this.configUpdate = false;
    }

    setTrackBpm() {
        let oldVal = this.checkPlayDataChange('firstCarLabTime', 'setTrackBpm', true);
        if(oldVal !== false || this.configUpdate) {
            let speedDivider = this.config.bpmDivider;
            let newVal = Math.round(this.getPlayData('firstCarLabTime') / speedDivider);
            let currentVal = (this.configUpdate) ? newVal : Math.round(oldVal/speedDivider);

            console.log('Changing BPM', {from: currentVal, to: newVal});
            new TWEEN.Tween({x: currentVal})
                .to({x: newVal}, 5000)
                .onUpdate(function() {
                    console.log('Changing bpm', this.x.toFixed(2));
                    abletonApi.setTempo(this.x.toFixed(2));
                })
                .start();
        }
    }

    setDrums() {
        if(this.checkPlayDataChange('windDirection', 'setDrumsWind') || this.configUpdate) {
            let raw = this.getPlayData('windDirection');
            let percent = raw/360;
            let knop = Math.round(this.config.snareMaxValue*percent);
            console.log('Setting snare to', {raw, percent, knop});
            abletonApi.setParameterForDevice(3, 0, 1, knop);
        }

        if(this.checkPlayDataChange('windSpeed', 'setDrumsWindSpeed') || this.configUpdate) {
            let raw = this.getPlayData('windSpeed');
            let percent = this.getPlayData('windSpeed')/this.config.kickWindSpeedDivider;
            let knop = Math.round(this.config.kickMaxValue*percent);
            console.log('Setting kick to', {raw, percent, knop});
            abletonApi.setParameterForDevice(1, 0, 1, knop);
        }
    }

    /**
     * Reads flag status
     */
    readFlagStatus() {
        this.setPlayData('flag', this.currentData.track.flag);
        if(this.checkPlayDataChange('flag', 'flagChk') && !this.getPlayData('lastTrack')) {
            switch(this.getPlayData('flag')) {
                case 1:
                    console.log('Track off car on track!');
                    break;
                case 2:
                    console.log('Green flag');
                    break;
                case 3:
                    console.log('Red flag');
                    break;
                case 4:
                    console.log('Chk flag');
                    break;
                case 5:
                    console.log('Yellow flag!');
                    break;
                case 6:
                    console.log('Full Yellow flag!');
                    break;
            }
        }
    }

    readTrackData() {
        let weather = this.currentData.track.weather;
        this.setPlayData('windDirection', weather.windDirection);
        this.setPlayData('windSpeed', weather.windSpeed);
        this.setPlayData('airTemp', weather.airTemp);
        this.setPlayData('roadTemp', weather.roadTemp);
        this.setPlayData('airPreassure', weather.airPreassure);
        this.setPlayData('airPreassure', weather.airPreassure);
    }

    /**
     * Reads current car status
     */
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
        let averageSpeed = 0;

        for(let i in cars) {
            accLabs += cars[i].laps;
            averageSpeed += cars[i].averageSpeed;

            if(cars[i].driverStatus == 4) {
                if(parseInt(cars[i].number) <= 13) {
                    this.setPlayData('pitDriver', cars[i].number);
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
                        this.setPlayData('driverChange', cars[i].number);
                    }
                }
            }

        }


        this.setPlayData('running', Math.round(127 * (running/numberOfCars)) + 1);
        this.setPlayData('pitStatus', Math.round(127 * (pits*2/numberOfCars)) + 1);
        this.setPlayData('pitOut', Math.round(127 * (pitOut*2/numberOfCars)) + 1);
        this.setPlayData('numberOfPlaceChanges', Math.round(127 * (numberOfCarChanges*10/numberOfCars)) + 1);
        this.setPlayData('numberOfDriverChanges', Math.round(127 * (numberOfDriverChanges*10/numberOfCars)) + 1);
        this.setPlayData('numberOfWetTires', Math.round(127 * (numberOfWetTires*3/numberOfCars)) + 1);
        this.setPlayData('currentLab', Math.abs(accLabs/numberOfCars).toFixed(1));

        if(averageSpeed <= 0) {
            averageSpeed = 200;
        } else {
            averageSpeed = Math.abs(averageSpeed/numberOfCars).toFixed(2);
        }

        this.setPlayData('averageSpeed', averageSpeed);
        this.setPlayData('firstCarLabTime', cars[0].lastTimeInMiliseconds);
        this.oldCarData = cars;
    };

    /**
     * Sets playdata for a given key
     * @param key
     * @param value
     */
    setPlayData(key, value) {
        this.playData[key] = value;
    }

    /**
     * Returns both new and old playdata for a given key
     * @param key
     * @param old
     * @returns {*}
     */
    getPlayData(key, defaultVal) {
        if(typeof this.playData[key] !== 'undefined') {
            return this.playData[key];
        }

        return (typeof defaultVal !== 'undefined') ? defaultVal : null;
    }

    /**
     * Checks if playdata for a given key has changed
     * @param key
     * @returns {boolean}
     */
    checkPlayDataChange(key, checkId, returnOld) {
        if(!checkId) {
            throw new Error('Checkid should be defined!');
        }

        let currentValue = this.getPlayData(key);
        if(typeof this.chkValues[checkId] !== 'undefined') {
            if(this.chkValues[checkId] !== currentValue) {
                console.log('Updated chackvalue', {
                    checkId: checkId,
                    currentValue: currentValue,
                    oldValue: this.chkValues[checkId]
                });
                let old = this.chkValues[checkId];
                this.chkValues[checkId] = currentValue;
                return (returnOld) ? old : true;
            }

            return false;
        } else if(currentValue !== null) {
            console.log('Creating check value', {
                checkId: checkId,
                currentValue: currentValue,
            });
            this.chkValues[checkId] = currentValue;
            return  (returnOld) ? currentValue : true;
        }

        return false;
    }

    /**
     * Saves current play status data to file
     */
    updateFile() {
        if(!this.spooling) {
            let saveObject = {
              playData: this.playData,
              chkValues: this.chkValues
            };
            fs.writeFileSync(this.saveFile, JSON.stringify(saveObject));
        }
    }

    readConfig() {
        let settingFile = 'settings.json';
        if(fs.existsSync(settingFile)) {
            let fileData = fs.statSync(settingFile);
            if(fileData.mtime.getTime() !== this.configModDate) {
                console.log('Config file has been updated!');
                this.configModDate = fileData.mtime.getTime();
                this.config = JSON.parse(fs.readFileSync(settingFile));
                this.configUpdate = true;
            }
        }
    }
}

let player = new Player();
player.run();