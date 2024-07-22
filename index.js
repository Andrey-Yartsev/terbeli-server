//import {WebSocketServer} from 'ws';
var WebSocketServer = require('ws').WebSocketServer;
var http = require('http');

var server = http.createServer(function(request, response) {
  console.log((new Date()) + ' Received request for ' + request.url);
  response.writeHead(200, {'Content-Type': 'text/plain'});
  response.write('Hello World!');
  response.end();
});
server.listen(80, function() {
  console.log((new Date()) + ' Server is listening on port 80');
});

const wss = new WebSocketServer({
  host: '0.0.0.0',
  port: 3000
});
// --
const TURN_PLAYER_1 = 1
const TURN_PLAYER_2 = 2
// -------- global state --------------
const players = {}
let playerPairs = []
const turnPlayers = {}
// const turnPlayer = playerName => {
//   let n = 0
//   playerPairs.forEach(pair => {
//     if (pair[0] === playerName) {
//       n = TURN_PLAYER_1
//     } else if (pair[1] === playerName) {
//       n = TURN_PLAYER_2
//     }
//   })
// }
const gameId = pair => {
  return pair[0] + ':' + pair[1]
}
const pairByPlayerName = playerName => {
  return playerPairs.find(pair => pair[0] === playerName || pair[1] === playerName)
}
const turnPlayer = playerName => {
  const pair = pairByPlayerName(playerName)
  if (!pair) {
    return null
  }
  if (!turnPlayers[gameId(pair)]) {
    return null
  }
  return turnPlayers[gameId(pair)]
}
const switchTurnPlayer = playerName => {
  const pair = pairByPlayerName(playerName)
  if (!pair) {
    return false
  }
  const gid = gameId(pair)
  if (!turnPlayers[gid]) {
    return false
  }
  if (turnPlayers[gid] === TURN_PLAYER_1) {
    turnPlayers[gid] = TURN_PLAYER_2
  } else {
    turnPlayers[gid] = TURN_PLAYER_1
  }
  return turnPlayers[gid]
}

const opponentName = playerName => {
  let opponentName;
  for (let i = 0; i < playerPairs.length; i++) {
    let pair = playerPairs[i]
    if (pair[0] === playerName) {
      return pair[1]
    } else if (pair[1] === playerName) {
      return pair[0]
    }
  }
  return null
}

wss.on('connection', ws => {
  const send = data => {
    ws.send(JSON.stringify(data))
    console.log('send: %s', JSON.stringify(data))
  }
  const sendBroadcast = data => {
    wss.clients.forEach(client => {
      client.send(JSON.stringify(data))
      console.log('sendBroadcast: %s', JSON.stringify(data))
    })
  }
  const wsSend = (ws, data) => {
    ws.send(JSON.stringify(data))
    console.log('send: %s', JSON.stringify(data))
  }
  // ------------------ state ---------------------------
  let playerName = null
  console.log('connection. set playerName = null')
  // ----------------------------------------------------
  const onMessageActions = {
    registerPlayer: ({name}) => {
      console.log('registering player ', name)
      playerName = name
      players[name] = {}
      players[name].ws = ws
      console.log('players: ', players)
      send({
        type: 'playerRegistered',
        data: {name}
      })
      sendBroadcast({
        type: 'updatePlayersList',
        data: players
      })
    },
    playWith: ({name}) => {
      const pair = [playerName, name]
      playerPairs.push(pair)
      turnPlayers[gameId(pair)] = TURN_PLAYER_1
      sendBroadcast({
        type: 'updatePlayerPairs',
        data: playerPairs
      })
      sendBroadcast({
        type: 'startGame',
        data: {
          pair
        }
      })
    },
    // turnPlayer - кто закинул кольцо
    addedRing: ({pinN}) => {
      const currentTurnPlayer = turnPlayer(playerName)
      sendBroadcast({
        type: 'addedRing',
        data: {
          playerName,
          turnPlayer: currentTurnPlayer,
          pinN
        }
      })
      const newTurnPlayer = switchTurnPlayer(playerName)
      if (!turnPlayer) {
        console.error('player ' + playerName + ' has gone')
        return
      }
      sendBroadcast({
        type: 'setTurnPlayer',
        data: {
          turnPlayer: newTurnPlayer
        }
      })
    },
    // пользователь покинул игру. леваем оппонента
    leaveGame: () => {
      let opName = opponentName(playerName)
      if (opName && players[opName]) {
        wsSend(players[opName].ws, {
          type: 'leaveGame',
          leftPlayerName: playerName
        })
      }
      // remove leaving pair
      playerPairs = playerPairs.filter(pair => {
        if (pair[0] === playerName || pair[1] === playerName) {
          return false
        }
        return true
      })
      sendBroadcast({
        type: 'updatePlayerPairs',
        data: playerPairs
      })
    },
    resetRender: () => {
      const opName = opponentName(playerName)
      wsSend(players[opName].ws, {
        type: 'resetRender'
      })
    },
    win: () => {
      const opName = opponentName(playerName)
      wsSend(players[opName].ws, {
        type: 'opponentWin'
      })
    }
    // // name - имя одного из пары
    // switchPlayer: ({name}) => {
    //   console.log('was', turnPlayer)
    //   turnPlayer = turnPlayer === 1 ? 2 : 1
    //   console.log('now', turnPlayer)
    //   wss.clients.forEach(client => {
    //     sendBroadcast(client, {
    //       type: 'setTurnPlayer',
    //       data: {
    //         playerName,
    //         turnPlayer
    //       }
    //     })
    //   })
    // }
  }
  const onCloseAction = () => {
    console.log('disconnect:', playerName ? playerName : 'noname')
    if (!playerName) {
      return
    }
    delete players[playerName] // !
    playerPairs = playerPairs.filter(pair => {
      return pair[0] === playerName || pair[0] === playerName
    })
    sendBroadcast({
      type: 'updatePlayersList',
      data: players
    })
    sendBroadcast({
      type: 'updatePlayerPairs',
      data: playerPairs
    })
    sendBroadcast({
      type: 'playerGone',
      data: {
        name: playerName
      }
    })
    send({
      type: 'serverDisconnect'
    })
  }
  // ----------------------------------------------------
  ws.on('error', console.error);
  ws.on('message', data => {
    console.log('received: %s', data)
    data = JSON.parse(data)
    if (!onMessageActions[data.type]) {
      console.error('onMessageAction ' + onMessageActions[data.type] + ' does not exists')
      return
    }
    onMessageActions[data.type](data.data)
  });
  ws.on('close', onCloseAction)
});
