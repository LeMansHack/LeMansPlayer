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

        this.endingMusicTrack = 98;
        this.stopMusicTrack = 106;

        //Application data
        this.mainInterval = null; //Main loop
        this.currentData = null; //Object containing current loaded data
        this.oldCarData = { }; //Object containing data of car positions in last update
        this.firstTime = true; //Tells if we area rendering the first loop
        this.chkValues = { }; //Object containing data on checked values


        //File data
        this.saveFile = './playdata2.json'; //File to save playdata to
        this.playData = { //Object containing current loaded playdata

        };

        //MIDI data
        this.midiWorking = false; //Check if MIDI is currently in use

        //Enviroment data
        this.live = false; //Set to true if track is running live
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

                        if(this.firstTime) {
                            this.onMidiNote();
                            this.firstTime = false;
                        }
                    });
                }, 1000);
            } else {
                let data = null;
                setInterval(() => {
                    let currentSec = (this.getPlayData('currentSec')) ? this.getPlayData('currentSec') : 0;
                    data = this.dataExplorer.getData(currentSec);
                    this.setPlayData('currentSec', currentSec + 1);
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
        this.setCurrentPlayingTrack(); //Sets current playing track
    }

    /**
     * Sets current playing track
     */
    setCurrentPlayingTrack() {
        if(this.getPlayData('flag') === 4 && !this.getPlayData('lastTrack')) {
            console.log('Playing last track!');
            this.setPlayData('lastTrack', true);
            this.setPlayData('musicLab', this.endingMusicTrack - 1);
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
        if((nextTrack > this.maxTracks) && !this.getPlayData('maxTracksOverflow')) {
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
        this.readCars();
        this.readFlagStatus();
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

        for(let i in cars) {
            accLabs += cars[i].laps;
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
    checkPlayDataChange(key, checkId, defaultValue) {
        if(!checkId) {
            throw new Error('Checkid should be defined!');
        }

        let currentValue = this.getPlayData(key, defaultValue);
        if(typeof this.chkValues[checkId] !== 'undefined') {
            if(this.chkValues[checkId] !== currentValue) {
                console.log('Updated chackvalue', {
                    checkId: checkId,
                    currentValue: currentValue,
                    oldValue: this.chkValues[checkId]
                });
                this.chkValues[checkId] = currentValue;
                return true;
            }

            return false;
        } else {
            console.log('Creating check value', {
                checkId: checkId,
                currentValue: currentValue,
            });
            this.chkValues[checkId] = currentValue;
            return true;
        }
    }
}

let player = new Player();
player.run();