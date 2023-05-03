// Importa o módulo http e o construtor Server do socket.io
const http = require('http')
const { Server } = require('socket.io')
const mysql = require('mysql2')

// Configurações do banco de dados
const dbConfig = {
  host: 'db-mysql-nyc1-chat-do-user-2678382-0.b.db.ondigitalocean.com',
  user: 'smartht',
  password: 'AVNS_1Om-Zz4iBSsKNY0UXR9',
  database: 'defaultdb',
  port: 25060
}

// Cria a conexão com o banco de dados
const db = mysql.createConnection(dbConfig)

// Cria o servidor HTTP e passa-o para o construtor Server do socket.io
const port = process.env.PORT || 50002
const server = http.createServer()
const io = new Server(server, {
  cors: {
    origin: 'https://conferencialivresvsa.com.br, http://localhost:5173',
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

const rooms = new Map()

io.on('connection', socket => {
  console.log('Novo usuário conectado')

  // Quando o cliente entra em uma nova sala
  socket.on('joinRoom', ({ author_id, author_name, room }) => {
    console.log(`Usuário ${author_name} entrou na sala ${room}`)
    // Verifica se já existe um usuário com o mesmo author_id na sala
    db.query(
      'SELECT * FROM users WHERE author_id = ? AND room = ?',
      [author_id, room],
      (err, results) => {
        if (err) {
          console.error(err)
          return
        }

        // Remove o usuário anterior (se existir)
        if (results.length > 0) {
          /* db.query('DELETE FROM users WHERE socket_id = ?', [
            results[0].socket_id
          ])
          socket.to(room).emit('userLeft', {
            author_id: results[0].author_id,
            author_name: results[0].author_name,
            author_msg: 'duas conexões simultâneas'
          }) */
          console.log('Usuário já conectado na sala')
        }

        // Adiciona o usuário ao banco de dados
        db.query(
          'INSERT INTO users (author_id, author_name, room, socket_id) VALUES (?, ?, ?, ?)',
          [author_id, author_name, room, socket.id]
        )

        // O cliente entra na sala
        socket.join(room)

        // Notifica a sala que um novo usuário entrou
        socket.to(room).emit('userJoined', {
          author_id: author_id,
          author_name: author_name,
          author_msg: 'conectou-se'
        })
      }
    )
  })

  // Quando o cliente envia uma mensagem
  socket.on('newMessage', ({ author_id, author_name, author_msg, room }) => {
    // Encontra o usuário que enviou a mensagem
    console.log(`Usuário ${author_name} enviou uma mensagem na sala ${room}`)
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
  socket.on('leaveRoom', room => {
    // Remove o usuário do banco de dados
    db.query(
      'DELETE FROM users WHERE socket_id = ?',
      [socket.id],
      (error, results) => {
        if (error) {
          console.error(error)
          return
        }
      }
    )
    // Sai da sala
    socket.leave(room)

    // Envia uma mensagem para a sala informando que um usuário saiu
    socket.to(room).emit('userLeave', `Usuário saiu da sala`)
  })

  // Quando o cliente se desconecta
  socket.on('disconnect', () => {
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
    db.query(
      'DELETE FROM users WHERE socket_id = ?',
      [socket.id],
      (error, results) => {
        if (error) {
          console.error(error)
          return
        }
      }
    )
  })

  // Total de usuários online na sala
  socket.on('totalUsers', room => {
    // Encontra o usuário que enviou a mensagem
    db.query(
      'SELECT COUNT(distinct author_id) as total FROM users WHERE room = ?',
      [room],
      (err, results) => {
        if (err) {
          console.error(err)
          return
        }

        // Envia a mensagem para a sala
        io.to(room).emit('onlineRoom', results[0].total)
        console.log(results)
      }
    )
  })
})

// Inicia o servidor
server.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`)
})
