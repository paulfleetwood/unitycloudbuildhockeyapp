// Initialise .env config.
require('dotenv').config();

let fs = require('fs');
let https = require('https');
let najax = require('najax');
let url = require("url");
let path = require("path");
let child_process = require('child_process');

// Options
var options = {
    unityAPIBase: "https://build-api.cloud.unity3d.com", // URI (e.g. href) received in web hook payload.
    unityCloudAPIKey: process.env.UNITYCLOUD_KEY,
    appCenterKey: process.env.APPCENTER_API_TOKEN,
    appCenterOwner: process.env.APP_CENTER_OWNER,
    appCenterAppName: process.env.APP_CENTER_APPNAME,
    distributionMapping: JSON.parse(process.env.DISTRIB_MAP)
};

let processUcbWebhook = async function (event) {
    let body = JSON.parse(event.body);

    // 1. Get Build API URL
    var buildAPIURL = body.links.api_self.href;

    if (!buildAPIURL) {
        throw new Error("No build link from Unity Cloud Build webhook");
    }

    if (!options.distributionMapping.hasOwnProperty(body.buildTargetName)) {
        console.log("No distribution for " + body.buildTargetName);
        return;
    }

    let distributionGroup = options.distributionMapping[body.buildTargetName];

    let buildDetails = await getBuildDetails(buildAPIURL);

    let downloadUrl = buildDetails.links.download_primary.href;
    let parsed = url.parse(downloadUrl);
    let filename = "/tmp/" + path.basename(parsed.pathname);

    let downloadedFile = downloadBinary(downloadUrl, filename);

    let downloadDsymUrl = buildDetails.links.download_dsym.href;
    let dsymParsed = url.parse(downloadDsymUrl);
    let dsymFilename = "/tmp/" + path.basename(dsymParsed.pathname);

    let downloadedDsymFile = downloadBinary(downloadDsymUrl, dsymFilename);

    let execFile = './node_modules/.bin/appcenter';
    let credentialsArgs = [
        "--token", options.appCenterKey,
        "--app", options.appCenterOwner + "/" + options.appCenterAppName];

    console.log("Uploading app file " + await downloadedFile);

    child_process.execFileSync(execFile,
        ["distribute", "release",
            "--file", await downloadedFile,
            "--group", distributionGroup,
            "--build-version", buildDetails.build,
            "--release-notes", buildDetails.buildTargetName + " #" + buildDetails.build]
            .concat(credentialsArgs));

    console.log("Uploading symbol file " + await downloadedDsymFile);

    child_process.execFileSync(execFile,
        ["crashes", "upload-symbols",
            "--symbol", await downloadedDsymFile]
            .concat(credentialsArgs));

    deleteFile(downloadedFile);
    deleteFile(downloadedDsymFile);
};

let getBuildDetails = async function (buildAPIURL) {
    console.log("1. getBuildDetails: start");

    return new Promise((resolve, reject) => {
        najax({
            url: options.unityAPIBase + buildAPIURL,
            type: 'GET',
            headers: {
                'Authorization': 'Basic ' + options.unityCloudAPIKey
            },
            success: function (data) {

                var data = JSON.parse(data);

                console.log("1. getBuildDetails: finished");

                resolve(data);
            },
            error: function (error) {
                console.log(error);
                reject(new Error("Problem getting build details from Unity Cloud Build."));
            }
        });
    });
}


let downloadBinary = async function (binaryURL, filename) {

    console.log("2. downloadBinary: start");
    console.log("   " + binaryURL);
    console.log("   " + filename);

    deleteFile(filename);

    return new Promise((resolve, reject) => {
        https.get(binaryURL, (res) => {
            // console.log('statusCode: ', res.statusCode);
            // console.log('headers: ', res.headers);
            var writeStream = fs.createWriteStream(filename, {'flags': 'a'});

            var len = parseInt(res.headers['content-length'], 10);
            var cur = 0;
            var total = len / 1048576; //1048576 - bytes in  1Megabyte

            res.on('data', (chunk) => {

                cur += chunk.length;
                writeStream.write(chunk, 'binary');

                process.stdout.write(".");
                // console.log("Downloading " + binaryURL + " " + (100.0 * cur / len).toFixed(2) + "%, Downloaded: " + (cur / 1048576).toFixed(2) + " mb, Total: " + total.toFixed(2) + " mb");
            });

            res.on('end', () => {
                console.log("2. downloadBinary: finished");
                writeStream.end();
            });

            writeStream.on('finish', () => {
                console.log("2. downloadBinary: " + filename + " finished");
                resolve(filename);
            });

        }).on('error', (e) => {
            console.error(e);
            reject(e);
        });
    });
}

// Delete file, used to clear up any binary downloaded.
function deleteFile(filename) {
    fs.exists(filename, function (exists) {
        if (exists) {
            // Delete File.
            fs.unlinkSync(filename);
            console.log("Deleted local file " + filename);
        }
    });
}

exports.handler = async function (event, context) {
    console.log("Event: " + JSON.stringify(event));
    console.log("Context: " + JSON.stringify(context));

    await processUcbWebhook(event);

    return "Success for everyone and all!";
}