//front end
const { ipcRenderer } = require('electron');
const { shell } = require('electron');

var debug_flag = false;
var t_id;

ipcRenderer.on('log', (event, arg) => {
    console.log(arg) 
  });

  ipcRenderer.on('atem-debug', (event, arg) => {
    console.log(arg) 
  });

  ipcRenderer.on('status-ip', (event, arg) => {
    console.log(arg) 
    $( "#ip" ).text(arg);
  });

  ipcRenderer.on('status-name', (event, arg) => {
    console.log("received name: " + arg) 

    $( "#name" ).text(arg);
  });

  ipcRenderer.on('status-connected', (event, arg) => {
    console.log("received status: " + arg) 
    $( ".form" ).removeClass("red");
    $( ".form" ).addClass("green");
  });

  ipcRenderer.on('status-disconnected', (event, arg) => {
    console.log("received status: " + arg) 
    $( ".form" ).removeClass("green");
    $( ".form" ).addClass("red");
  });


  ipcRenderer.on('tally-id', (event, arg) => {
    console.log("received tally-id: " + arg);
    $( "#t_id" ).removeClass('hide');
    $( "#t_id" ).text(arg);
    t_id = arg;
  });

  ipcRenderer.on('tally-qr', (event, arg) => {
    console.log("receieved qr: " + arg);
    $( "#qr" ).removeClass('hide');
    $("#qr").append(arg);
  });

  ipcRenderer.on('tally-latency', (event, arg) => {
    // console.log(arg);
    $("#latency").text('Round Trip Latency: ' + arg.latency + 'ms');
    $("#pt").text('Server Processing Time: ' + arg.pt + 'ms');
  });
  
  

$( "#ip" ).click(function(){
    $( "#ip" ).addClass('hide');
    $( "#ip_enter" ).removeClass('hide');

    //submit on enter
    $(document).on('keypress',function(e) {
        if(e.which == 13) {
            $( "#ip_enter" ).addClass('hide');
            $( "#ip" ).removeClass('hide');
            ipcRenderer.send('atem-connect', $( "#ip_enter").val());
        }
    });

        //submit on escape
        $(document).on('keypress',function(e) {
          if(e.which == 27) {
              $( "#ip" ).addClass('hide');
              $( "#ip_enter" ).removeClass('hide');
          }
      });
});

$( "#debug" ).click(function(){
  if(debug_flag){
    $( ".stats" ).addClass('hide');
    ipcRenderer.send('tally-debug', false);
    debug_flag = false;
  } else {
    $( ".stats" ).removeClass('hide');
    ipcRenderer.send('tally-debug', true);
    debug_flag = true;
  }
  
});

$( "#t_id").on("click", function(){
  console.log("opening web browser");
  shell.openExternal("https://tally.aginn.tech/server?id=" + t_id);
})


//call for debug
function requestDebug(){
  ipcRenderer.send('req-debug');
}