var fs = require('fs');
var moment = require('moment');

var dataExplorer = function() {
    this.folder = __dirname + '/data/';
    this.data = null;
};



dataExplorer.prototype.getDate = function(secound) {
    var date = moment(1402765742359).add(secound, 'milliseconds');
    return date.valueOf();
};

dataExplorer.prototype.getFileData = function(timestamp) {
    var file = this.folder + timestamp.toString() + '.json';
    if(fs.existsSync(file)) {
        console.log('New file!');
        console.log(file);
        return JSON.parse(fs.readFileSync(file));
    }
    
    return false;
};

dataExplorer.prototype.getData = function(secound) {
    var date = this.getDate(secound);
    var data = this.getFileData(date);
    if(data) {
        this.data = data;
    }
    
    return this.data;
};


module.exports = dataExplorer;