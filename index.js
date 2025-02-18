//import {WebSocketServer} from 'ws';
var WebSocketServer = require('ws').WebSocketServer;
const rusname = require('./rusname')

const wss = new WebSocketServer({
  //host: '0.0.0.0',
  port: 8080
}, () => {
  console.log('WebSocket server running...')
});

// --
const TURN_PLAYER_1 = 1
const TURN_PLAYER_2 = 2
// -------- global state --------------
const players = {}
const playersWs = {}
let playerPairs = []
const turnPlayers = {}

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

wss.on('open', () => {
  console.log('ws open ok')
})
wss.on('connection', ws => {
  ws.on('error', console.error);
  const sendSelf = data => {
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
  const sendToOpponent = (playerName, data) => {
    const opName = opponentName(playerName)
    if (!opName) {
      // no opponent
      return
    }
    if (!playersWs[opName]) {
      console.log('Try to send to ' + opName + ', but player not connected')
      // sendSelf('opponentGone: ' + playerName)
      return
    }
    wsSend(playersWs[opName], data)
  }
  const genName = () => {
    let name = ''
    for (let i = 0; i < 20; i++) {
      let newName = rusname()
      if (!players[newName]) {
        // если еще нет игрока с таким именем
        return newName
      }
    }
    return 'name error'
  }
  // ------------------ state ---------------------------
  let playerName = null
  console.log('connection. set playerName = null')
  // ----------------------------------------------------
  const registerPlayer = name => {
    console.log('players: ', players)
    console.log('registering player ', name)
    playerName = name
    players[name] = {}
    playersWs[name] = ws
    console.log('players: ', players)
    sendSelf({
      type: 'playerRegistered',
      data: {name}
    })
    sendBroadcast({
      type: 'updatePlayersList',
      data: players
    })
    sendBroadcast({
      type: 'updatePlayerPairs',
      data: playerPairs
    })
  }
  const onMessageActions = {
    registerPlayer: () => {
      const name = genName()
      registerPlayer(name)
    },
    registerPlayerByName: ({name}) => {
      registerPlayer(name)
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
      sendToOpponent(playerName, {
        type: 'addedRing',
        data: {
          playerName,
          turnPlayer: currentTurnPlayer,
          pinN
        }
      })
      sendSelf({
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
      sendToOpponent(playerName, {
        type: 'setTurnPlayer',
        data: {
          turnPlayer: newTurnPlayer
        }
      })
      sendSelf({
        type: 'setTurnPlayer',
        data: {
          turnPlayer: newTurnPlayer
        }
      })
    },
    // excludeFromOnline() {
    //   // пользователь перешел на другую страницу
    //   delete players[playerName]
    //   sendBroadcast({
    //     type: 'updatePlayersList',
    //     data: players
    //   })
    // },
    // includeToOnline() {
    //   if (!players[playerName]) {
    //     players[playerName] = {}
    //     sendBroadcast({
    //       type: 'updatePlayersList',
    //       data: players
    //     })
    //   }
    // },
    // пользователь покинул игру. леваем оппонента
    leaveGame: () => {
      sendToOpponent(playerName, {
        type: 'resetGame',
        data: {
          playerName
        }
      })
      delete players[playerName]
      delete playersWs[playerName]
      sendSelf({
        type: 'leftGame'
      })
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
      sendBroadcast({
        type: 'updatePlayersList',
        data: players
      })
    },
    leavePlayerGame: () => {
      sendToOpponent(playerName, {
        type: 'resetGame',
        data: {
          playerName
        }
      })
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
    resetGame: () => {
      sendToOpponent(playerName, {
        type: 'resetGame',
        data: {
          playerName
        }
      })
    },
    win: () => {
      sendToOpponent(playerName, {
        type: 'opponentWin'
      })
    }
  }
  const onCloseAction = () => {
    console.log('disconnect:', playerName ? playerName : 'noname')
    if (!playerName) {
      return
    }
    // sendToOpponent(playerName, {
    //   type: 'leftGame'
    // })

    delete players[playerName]
    delete playersWs[playerName]
    console.log(playerName + ' уходит. пары до ухода:', playerPairs)
    playerPairs = playerPairs.filter(pair => {
      if (pair[0] === playerName || pair[1] === playerName) {
        // если в паре есть ушедший игрок, удаляем пару
        return false
      }
      return true
    })
    console.log('пары после ухода: ', playerPairs)
    sendBroadcast({
      type: 'updatePlayersList',
      data: players
    })
    //console.log(playerPairs)
    sendBroadcast({
      type: 'updatePlayerPairs',
      data: playerPairs
    })
    sendSelf({
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
