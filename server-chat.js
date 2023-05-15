// Importa o módulo http e o construtor Server do socket.io
const http = require('http')
const { Server } = require('socket.io')
const mysql = require('mysql2')
const path = require('path')
const dotenv = require('dotenv').config({ path: './.env' })

// Configurações do banco de dados
/* const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT
} */

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT
}

// Cria a conexão com o banco de dados
const db = mysql.createConnection(dbConfig)

// Cria o servidor HTTP e passa-o para o construtor Server do socket.io
const port = process.env.PORT || 50002
const server = http.createServer()
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

// Cria a tabela 'users' no banco de dados (se ela não existir)
db.query(`
  CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT,
    author_id VARCHAR(255) NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    room VARCHAR(255) NOT NULL,
    socket_id VARCHAR(255) NOT NULL,
    PRIMARY KEY (id)
  )
`)

// Funções auxiliares
async function getUserByAuthorIdAndRoom(author_id, room) {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT * FROM users WHERE author_id = ? AND room = ?',
      [author_id, room],
      (err, results) => {
        if (err) {
          reject(err)
          return
        }
        resolve(results)
      }
    )
  })
}

async function addUserToDatabase(author_id, author_name, room, socket_id) {
  return new Promise((resolve, reject) => {
    db.query(
      'INSERT INTO users (author_id, author_name, room, socket_id) VALUES (?, ?, ?, ?)',
      [author_id, author_name, room, socket_id],
      (err, results) => {
        if (err) {
          reject(err)
          return
        }
        resolve(results)
      }
    )
  })
}

async function removeUserFromRoom(socket_id, room) {
  return new Promise((resolve, reject) => {
    db.query(
      'DELETE FROM users WHERE socket_id = ? AND room = ?',
      [socket_id, room],
      (error, results) => {
        if (error) {
          reject(error)
          return
        }
        resolve(results)
      }
    )
  })
}

async function removeUserFromDatabase(socket_id) {
  return new Promise((resolve, reject) => {
    db.query(
      'DELETE FROM users WHERE socket_id = ?',
      [socket_id],
      (error, results) => {
        if (error) {
          reject(error)
          return
        }
        resolve(results)
      }
    )
  })
}

async function countUserFromRoom(room) {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT COUNT(distinct author_id) as total FROM users WHERE room = ?',
      [room],
      (error, results) => {
        if (error) {
          reject(error)
          return
        }
        resolve(results)
      }
    )
  })
}

const rooms = new Map()

io.on('connection', socket => {
  // Quando o cliente entra em uma nova sala
  socket.on('joinRoom', async ({ author_id, author_name, room }) => {
    console.log(`Usuário ${author_name} entrou na sala ${room}`)
    // Verifica se já existe um usuário com o mesmo author_id na sala
    try {
      socket.join(room)
      socket.to(room).emit('userJoined', {
        author_id: author_id,
        author_name: author_name,
        author_msg: 'conectou-se'
      })
      await addUserToDatabase(author_id, author_name, room, socket.id)
      /* const existingUser = await getUserByAuthorIdAndRoom(author_id, room)
      if (existingUser.length > 0) {
        console.log('Usuário já conectado na sala')
      } else {
        await addUserToDatabase(author_id, author_name, room, socket.id)
        socket.join(room)
        socket.to(room).emit('userJoined', {
          author_id: author_id,
          author_name: author_name,
          author_msg: 'conectou-se'
        })
      } */
    } catch (err) {
      console.error(err)
    }
  })

  // Quando o cliente envia uma mensagem
  socket.on('newMessage', ({ author_id, author_name, author_msg, room }) => {
    // Envia a mensagem para a sala
    /* io.to(room).emit('receivedMessage', {
      author_id: author_id,
      author_name: author_name,
      author_msg: author_msg
    }) */

    // Encontra o usuário que enviou a mensagem
    db.query(
      'SELECT * FROM users WHERE socket_id = ?',
      [socket.id],
      (err, results) => {
        if (err) {
          console.error(err)
          return
        }
        // Envia a mensagem para a sala
        io.to(room).emit('receivedMessage', {
          author_id: results[0].author_id,
          author_name: results[0].author_name,
          author_msg: author_msg
        })
      }
    )
  })

  // Define o evento de saída de uma sala
  socket.on('leaveRoom', async room => {
    // Remove o usuário do banco de dados
    try {
      await removeUserFromRoom(socket.id, room)
    } catch (err) {
      console.error(err)
    }
    // Sai da sala
    socket.leave(room)
    // Envia uma mensagem para a sala informando que um usuário saiu
    socket.to(room).emit('userLeave', `Usuário saiu da sala`)
  })

  // Quando o cliente se desconecta
  socket.on('disconnect', async () => {
    // Notifica a sala que o usuário saiu
    db.query(
      'SELECT * FROM users WHERE socket_id = ?',
      [socket.id],
      (error, results) => {
        if (error) {
          console.error(error)
          return
        }
        if (results.length > 0) {
          const user = results[0]
          io.to(user.room).emit('userLeft', {
            author_id: user.author_id,
            author_name: user.author_name,
            author_msg: 'desconectou-se'
          })
        }
      }
    )
    // Remove o usuário do banco de dados
    try {
      await removeUserFromDatabase(socket.id)
    } catch (err) {
      console.error(err)
    }
  })

  // Total de usuários online na sala
  socket.on('totalUsers', async room => {
    // Total de usuários na sala
    console.log('totalUsers')
    try {
      const res = await countUserFromRoom(room)
      io.to(room).emit('onlineRoom', res[0].total)
    } catch (err) {
      console.error(err)
    }
  })
})

// Inicia o servidor
server.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`)
})
