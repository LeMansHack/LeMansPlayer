# LeManHack 16 MIDI project

## About
Midi controller for LeMan data to control knops and playback in Ableton Live from data

##Requirements
- Ableton Live
- Max4Live
- NodeJS

## How to install
1. Clone repo
2. Run `yarn install`

## How to run
To playback test data and live data when ready, use the command `node play.js`. This command will start playback from live or test data. If using test data set it starts from top and runs continually to finish.
**Please be aware that MIDI controllers take 10 seconds to initialise when you start running the program. Therefore there will be no sund in 10 seconds**

To map new keys to project, use `node app.js`. When running a new MIDI interact with output `Test  output` will be running on your computer. When the node app is running just enter the note value in console and press enter to create a new node on default channel 176. To test with value change enter fx `2 120` to send a note with value 120. To test on another channel than 176 enter `2 120 175` to send a note 2 with value 120 on channel 175.