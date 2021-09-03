const { app, ipcMain, BrowserWindow, Menu } = require('electron');
const path = require('path');
const request = require('request');
const QRCode = require('qrcode');
const io = require('socket.io-client');
const socket = io("https://tally.aginn.tech/");
const Store = require('electron-store');
const store = new Store();

const EventEmitter = require('events');
const eventEmitter = new EventEmitter();

// Add a connect listener
socket.on('connect', function (socket) {
  console.log('Connected to tally.aginn.tech!');
});

const { Atem } = require('atem-connection');
const myAtem = new Atem({ externalLog: console.log });

const KEEP_ALIVE_INTERVAL = 5 * 60 * 1000 // 5 minutes


// In the Main process.
var name = "unknown"
var connected = false;
var ip = recallIP();  //load IP
// var clientId = '123456';
var clientId = cidGen();
var debug_interval;
var t_server;
var progam = [];
var preview = [];

const Template = require('./menu_template.js');
// const { data } = require('jquery');
const template = Template.getTemplate(app);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

//435x435 final
const createWindow = () => {
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  initTallyClient();
  var loaded = false;
  // Create the browser window.
  //Events
eventEmitter.on('tally-ready', (data) => {
  console.log(data);
  const mainWindow = new BrowserWindow({
    width: 400,
    height: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon:'./icon.icns'
  });


  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.on('did-finish-load', () => {
    loaded = true;
    mainWindow.webContents.send('status-ip', ip);
    // mainWindow.webContents.send('status-name', name);
    mainWindow.webContents.send('tally-qr', data.qr);
    mainWindow.webContents.send('tally-id', data.server);

    if(name != "unkown"){
      mainWindow.webContents.send('status-name', name);
    }
    if(connected){
      mainWindow.webContents.send('status-connected', "connected");
    }

    //socket recieve latency messages based on id and client id
    socket.on(data.server + '_' + clientId + '_latency', function (msg) {
      //get current timestamp
      var currentTS = new Date().getTime();
      //do round trip math
      var lrt = currentTS - msg.ogTS;
      mainWindow.webContents.send('tally-latency', { "latency": lrt, "pt": msg.pt });
    });
  });

  eventEmitter.on("status-connected", () => {
      mainWindow.webContents.send('status-connected', "connected");
  });

  eventEmitter.on("status-name", () => {
      mainWindow.webContents.send('status-name', name);
  });

  eventEmitter.on("status-disconnected", () => {
    mainWindow.webContents.send('status-disconnected', "disconnected");
  });

  ipcMain.on('atem-connect', async (event, arg) => {
    if(validateIP(arg)){
      storeIP(arg);
      console.log("ATEM Connecting: " + arg);
      // await myAtem.disconnect()
      ip = arg;
      mainWindow.webContents.send('status-ip', ip);
      await myAtem.disconnect().then(myAtem.connect(ip))
      return 0;
    }
    console.log("invalid ip address");
    return -1;
  });

  ipcMain.on('req-debug', (event, arg) => {
    console.log("Requesting Debug");
    mainWindow.webContents.send('atem-debug', myAtem.state);
  });

  ipcMain.on('tally-debug', (event, arg) => {
    console.log("Tally Server: debug " + arg);
    if(arg){
      // Open the DevTools.
      mainWindow.webContents.openDevTools();
      mainWindow.setSize(1000, 400, true);
      debug_interval = setInterval(function(){
        checkLatency(data.server);
      }, 1000);
    } else {
      clearInterval(debug_interval);
      // Open the DevTools.
      mainWindow.webContents.closeDevTools();
      mainWindow.setSize(400, 400, true);
    }
  }); 
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
  // if (process.platform !== 'darwin') {
  //   app.quit();
  // }
  app.quit();
  // app.quit();
  
});

app.on('will-quit', () => {
  console.log('will quit');
  
});

app.on('before-quit', (e) => {
  e.preventDefault();
  console.log("in before-quit");
  disconnect().then(result => {
    console.log(result);
    app.exit();
  }).catch(err => {
    console.log("error: " + err);
  });

});

app.on('quit', () => { 
  console.log('quit'); 
  app.exit(0);
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
myAtem.on('info', console.log);

myAtem.on('connected', () => {
  connected = true;
  name = myAtem.state.info.productIdentifier;
  //initialize program and preview
  for(var i = 0; i < myAtem.state.video.mixEffects.length; i++){
    // preview.push(myAtem.state.video.mixEffects[i].previewInput);
    // program.push(myAtem.state.video.mixEffects[i].programInput);
    request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=11&cam=' + myAtem.state.video.mixEffects[i].previewInput, (err, response, body) => {
        console.log(body);
      });

    request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=1&cam=' + myAtem.state.video.mixEffects[0].programInput, (err, response, body) => {
      console.log(body);
    });
  }

  //initialize auxes
  for(var i = 0; i < myAtem.state.video.auxilliaries.length; i++){
    var tbus = 21 + i;
    request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=' + tbus + '&cam=' + myAtem.state.video.auxilliaries[i], (err, response, body) => {
      console.log(body);
    });
  }


  console.log("atem: connected");
  //send connection status
  eventEmitter.emit('status-connected');
  eventEmitter.emit('status-name');
});

myAtem.on('disconnected', () => {
  connected = false;
  //name = myAtem.state.info.productIdentifier;
  console.log("atem: disconnected");
  //send connection status
  eventEmitter.emit('status-disconnected');
});

myAtem.on('stateChanged', function(err, state) {
  console.log(state); // catch the ATEM state.
  var x = [];
  if(Array.isArray(state)){
    x = state;
  } else {
    x.push(state);
  }
  for(var i = 0; i < x.length; i++){
    if(x[i] == "video.ME.0.previewInput" || x[i] == "video.mixEffects.0.previewInput"){
      //send to tally
      console.log("ME 1 Preview Change");
      console.log(myAtem.state.video.mixEffects[0].previewInput);
      request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=11&cam=' + myAtem.state.video.mixEffects[0].previewInput, (err, response, body) => {
        console.log(body);
      });
    } 
  
    if(x[i] == "video.ME.0.programInput" || x[i] == "video.mixEffects.0.programInput"){
      //send to tally
      console.log("ME 1 Program Change");
      request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=1&cam=' + myAtem.state.video.mixEffects[0].programInput, (err, response, body) => {
        console.log(body);
      });
    } 
    
    if(x[i] == "video.ME.1.previewInput" || x[i] == "video.mixEffects.1.previewInput"){
      //send to tally
      console.log("ME 2 Preview Change");
      request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=12&cam=' + myAtem.state.video.mixEffects[1].previewInput, (err, response, body) => {
        console.log(body);
      });
    } 
  
    if(x[i] == "video.ME.1.programInput" || x[i] == "video.mixEffects.1.programInput"){
      //send to tally
      console.log("ME 2 Program Change");
      request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=2&cam=' + myAtem.state.video.mixEffects[1].programInput, (err, response, body) => {
        console.log(body);
      });
    } 

    //auxes
    if(x[i] == "video.auxilliaries.0"){
      //send to tally
      console.log("Aux 1 Change");
      request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=21&cam=' + myAtem.state.video.auxilliaries[0], (err, response, body) => {
        console.log(body);
      });
    } 

    if(x[i] == "video.auxilliaries.1"){
      //send to tally
      console.log("Aux 2 Change");
      request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=22&cam=' + myAtem.state.video.auxilliaries[1], (err, response, body) => {
        console.log(body);
      });
    } 

    if(x[i] == "video.auxilliaries.2"){
      //send to tally
      console.log("Aux 3 Change");
      request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=23&cam=' + myAtem.state.video.auxilliaries[2], (err, response, body) => {
        console.log(body);
      });
    } 

    if(x[i] == "video.auxilliaries.3"){
      //send to tally
      console.log("Aux 4 Change");
      request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=24&cam=' + myAtem.state.video.auxilliaries[3], (err, response, body) => {
        console.log(body);
      });
    } 

    if(x[i] == "video.auxilliaries.4"){
      //send to tally
      console.log("Aux 5 Change");
      request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=25&cam=' + myAtem.state.video.auxilliaries[4], (err, response, body) => {
        console.log(body);
      });
    } 

    if(x[i] == "video.auxilliaries.5"){
      //send to tally
      console.log("Aux 6 Change");
      request.get('https://tally.aginn.tech/api/update?id=' + t_server + '&tBus=26&cam=' + myAtem.state.video.auxilliaries[5], (err, response, body) => {
        console.log(body);
      });
    } 
  
    // if(x[i] == "info"){
    //   name = myAtem.state.info.productIdentifier;
    //   console.log(myAtem.state.info.productIdentifier);
  
    //   eventEmitter.emit("status-name");
    // }
  }

  



});

function initTallyClient(){
  //connect to tally server
  
  var t_qr;
  request.get("https://tally.aginn.tech/api/new", (err, response, body) => {
    if (err) { console.log(err); return -1; }
    // console.log(response.data);
    var result = JSON.parse(body);

    //handle errors
    if(result.result == "success"){
      console.log("Tally Server: " + result.data);
      t_server = result.data;
      myAtem.connect(ip);

      //keep tally instance alive while running
      //handle if server disconnects?
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
        eventEmitter.emit('tally-ready', {"qr": t_qr, "server": t_server});
      });
    }
  }); 
}

//Generate client ID
function cidGen(){
  var retVal = Math.floor(100000 + Math.random() * 900000)
    console.log("Client ID: " + retVal);
    return retVal;
}

function checkLatency(server){
 var startTime = new Date().getTime();
  request.get('https://tally.aginn.tech/api/latency?id=' + server + '&cid=' + clientId + '&ts=' + startTime, (err, response, body) => {
    if(err) { console.log(err); return -1; }
    //console.log("Tally Server: " + body);
  });
}


async function disconnect(callback){
  try{
    console.log("in disconnect");
    eventEmitter.removeAllListeners();
  
    myAtem.removeAllListeners();
    clearInterval(debug_interval);
    await myAtem.disconnect();
    var x = await myAtem.destroy();
    if(callback != null){
      callback();
    }
    return x;
  } catch(e) {
    console.log(e);
    throw e;  
  }
}

function validateIP(ipaddress) {  
  if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipaddress)) {  
    return true;  
  }   
  return false;  
}  


function recallIP(){
  var ip = store.get('recall');
  if(ip){
    return ip
  }
  ip = "192.168.1.2";
  return ip;
}

function storeIP(ip){
  store.set('recall', ip);
  return 0;
}