const index = require('./index');

// Options
var options = {
    port: process.env.PORT || 80, // Heroku port or 80.
};

// Imports
var  express = require('express'),
    app = express(),
    http = require('http'),
    server = http.Server(app),
    bodyParser = require('body-parser');

// Run Server
var server = server.listen( options.port, function(){
    console.log('listening on *:' + options.port );
});

// Configure Express
app.use('/public', express.static('public'));

// parse application/json
// app.use(bodyParser.json()); // Parse all
var jsonParser = bodyParser.json();

app.get('/', function(req, res){
    res.sendFile( __dirname + '/index.html' );
});

// POST /api/users gets JSON bodies
var mainRes;
app.post('/unitycloudbuildwebhook', jsonParser, function (req, res) {
    if (!req.body) return res.sendStatus(400);

    index.handler(req.body, null).then(r => {
        res.send({
            error: false,
            message: "Success! '" + req.body.projectName + "' platform '" + req.body.buildTargetName + "'."
            });
    });
});
