var midi = require('midi');
var stdin = process.openStdin();
var output = new midi.output();
output.openVirtualPort("Test Output");

var input = new midi.input();
input.on('message', function(deltaTime, message) {
        // The message is an array of numbers corresponding to the MIDI bytes:
        //   [status, data1, data2]
        // https://www.cs.cf.ac.uk/Dave/Multimedia/node158.html has some helpful
        // information interpreting the messages.
        console.log('m:' + message + ' d:' + deltaTime);
});

var note = 0;
var value = 127;
var channel = 176;
var timerFunc = null;

stdin.addListener("data", function(d) {
        var input = d.toString().trim().split(" ");
        note = parseInt(input[0]);
        value = (input.length > 1) ? input[1] : 127;
        channel = (input.length > 2) ? input[2] : 176;
        console.log('Note set to ' + note);
        console.log('Value set to ' + value);
        console.log('Channel set to ' + channel);

        output.sendMessage([channel, note, value]);
});

input.openVirtualPort("Test input");


// A midi device "Test Input" is now available for other
// software to send messages to.

// ... receive MIDI messages ...

// Close the port when done.