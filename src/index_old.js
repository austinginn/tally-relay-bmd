const { app, ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const request = require('request');
const QRCode = require('qrcode');
const io = require('socket.io-client');
const socket = io("https://tally.aginn.tech/");

const EventEmitter = require('events');
const eventEmitter = new EventEmitter();

// Add a connect listener
socket.on('connect', function (socket) {
  console.log('Connected!');
});



const { Atem } = require('atem-connection');
const myAtem = new Atem({ externalLog: console.log, });

const KEEP_ALIVE_INTERVAL = 5 * 60 * 1000 // 5 minutes


// In the Main process.
var name = "unknown"
var connected = false;
var ip = "172.22.0.250";  //default IP
var t_server;
var t_qr;
// var clientId = '123456';
var clientId = cidGen();
var debug_interval;
// var mainWindow;


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

//435x435 final
const createWindow = () => {
  var loaded = false;
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 400,
    height: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon:'./icon.icns'
  });

  initTallyClient(mainWindow);

  // mainWindow.webContents.send('your-event', customData);

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));



  mainWindow.webContents.on('did-finish-load', () => {
    loaded = true;
    mainWindow.webContents.send('status-ip', ip);
    if(t_qr){
      mainWindow.webContents.send('tally-qr', t_qr);
    }
    if(t_server){
      mainWindow.webContents.send('tally-id', t_server);
    }
  });


//Events
eventEmitter.on('qr-ready', () => {
  if(loaded){
    mainWindow.webContents.send('tally-qr', t_qr);
  }
});

eventEmitter.on('tally-ready', () => {
  if(loaded){
    mainWindow.webContents.send('tally-id', t_server);
  }
});



  ipcMain.on('atem-connect', (event, arg) => {
    console.log("ATEM Connecting: " + arg);
    myAtem.connect(arg);
  });

  ipcMain.on('tally-debug', (event, arg) => {
    console.log("Tally Server: debug " + arg);
    if(arg){
      // Open the DevTools.
      mainWindow.webContents.openDevTools();
      mainWindow.setSize(1000, 400, true);
      debug_interval = setInterval(function(){
        checkLatency();
      }, 1000);
    } else {
      clearInterval(debug_interval);
      // Open the DevTools.
      mainWindow.webContents.closeDevTools();
      mainWindow.setSize(400, 400, true);
    }

  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
myAtem.on('error', console.error);

myAtem.on('connected', () => {
  connected = true;
  //name = myAtem.state.info.productIdentifier;
  console.log("status: connected");
  //send connection status
  mainWindow.webContents.send('status-connected', "connected");
});

myAtem.on('stateChanged', function(err, state) {
  console.log(state); // catch the ATEM state.

  if(state == "video.ME.0.previewInput"){
    //send to tally
    request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&pid=11&cam=' + myAtem.state.video.ME[0].previewInput, (err, response, body) => {
      console.log(body);
    });
  } 

  if(state == "video.ME.0.programInput"){
    //send to tally
    request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&pid=1&cam=' + myAtem.state.video.ME[0].programInput, (err, response, body) => {
      console.log(body);
    });
  } 
  
  if(state == "video.ME.1.previewInput"){
    //send to tally
    request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&pid=12&cam=' + myAtem.state.video.ME[1].previewInput, (err, response, body) => {
      console.log(body);
    });
  } 

  if(state == "video.ME.1.programInput"){
    //send to tally
    request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&pid=2&cam=' + myAtem.state.video.ME[1].programInput, (err, response, body) => {
      console.log(body);
    });
  } 

  if(state == "info"){
    name = myAtem.state.info.productIdentifier;
    mainWindow.webContents.send('status-name', name);
  }

});

function initTallyClient(mainWindow){
  //connect to tally server
  request.get("https://tally.aginn.tech/api/new", (err, response, body) => {
    if (err) { console.log(err); return -1; }
    // console.log(response.data);
    var result = JSON.parse(body);

    //handle errors
    console.log("Tally Server: " + result.data);
    t_server = result.data;
    eventEmitter.emit('tally-ready');

    //keep tally instance alive while running
    setInterval(function () {
      request.get("https://tally.aginn.tech/api/keepalive?id=" + t_server, (err, response, body) => {
        if (err) { console.log(err); return -1; }

        //handle errors
        if (JSON.parse(body).result == "success") {
          console.log("Tally Server: alive " + t_server);
        }
      });
    }, KEEP_ALIVE_INTERVAL);


    //generate q
    QRCode.toDataURL('https://tally.aginn.tech/tally?id=' + t_server, function (err, data_url) {
      console.log("App: generating QR for tally instance");

      // Display this data URL to the user in an <img> tag
      t_qr = '<img src="' + data_url + '">';
      eventEmitter.emit('qr-ready');
    });

    //socket recieve latency messages based on id and client id
    socket.on(t_server + '_' + clientId + '_latency', function (msg) {
      //get current timestamp
      var currentTS = new Date().getTime();
      //do round trip math
      var lrt = currentTS - msg.ogTS;
      mainWindow.webContents.send('tally-latency', { "latency": lrt, "pt": msg.pt });
    });
  });
}

//Generate client ID
function cidGen(){
  var retVal = Math.floor(100000 + Math.random() * 900000)
    console.log("Client ID: " + retVal);
    return retVal;
}

function checkLatency(){
 var startTime = new Date().getTime();
  request.get('https://tally.aginn.tech/api/latency?id=' + t_server + '&cid=' + clientId + '&ts=' + startTime, (err, response, body) => {
    if(err) { console.log(err); return -1; }
    //console.log("Tally Server: " + body);
  });
}