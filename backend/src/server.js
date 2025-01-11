const express = require('express');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const wss = new WebSocketServer({ port: process.env.PORT || 8080 });

const contadorFilePath = path.join(__dirname, 'contadorViagem.json');
const historicoFilePath = path.join(__dirname, 'historico.json');

let contadorViagens = 0;
let historico = {};

// Função para ler o contador de viagens
function readContador() {
    try {
        const data = fs.readFileSync(contadorFilePath);
        const parsedData = JSON.parse(data);
        return parsedData.contador || 0;
    } catch (error) {
        console.error('Erro ao ler contador:', error);
        return 0;
    }
}

// Função para ler o histórico
function readHistorico() {
    try {
        const data = fs.readFileSync(historicoFilePath);
        return JSON.parse(data);
    } catch (error) {
        console.error('Erro ao ler histórico:', error);
        return {};
    }
}

// Função para salvar o contador de viagens
function saveContador() {
    const data = JSON.stringify({ contador: contadorViagens }, null, 2);
    fs.writeFileSync(contadorFilePath, data);
}

// Função para salvar o histórico
function saveHistorico() {
    const data = JSON.stringify(historico, null, 2);
    fs.writeFileSync(historicoFilePath, data);
}

contadorViagens = readContador(); // Lê o contador do arquivo
historico = readHistorico(); // Lê o histórico do arquivo

console.log(`Servidor rodando na porta ${process.env.PORT || 8080}`);

app.use(express.json()); // Middleware para JSON

// Rota para obter o contador de viagens
app.get('/contador', (req, res) => {
    res.json({ contador: contadorViagens });
});

// Rota para obter o histórico
app.get('/historico', (req, res) => {
    res.json(historico);
});

// Rota para atualizar o contador de viagens
app.post('/contador', (req, res) => {
    contadorViagens = req.body.contador;
    saveContador();
    res.status(200).json({ contador: contadorViagens });
});

// Rota para atualizar o histórico de uma carreta
app.post('/historico', (req, res) => {
    const { carretaId, tipo, hora } = req.body;
    if (!historico[carretaId]) {
        historico[carretaId] = [];
    }
    historico[carretaId].push(`${tipo}: ${hora}`);
    saveHistorico();
    res.status(200).json({ historico: historico[carretaId] });
});

// Inicia o servidor Express
app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor Express rodando!');
});

// WebSocket
wss.on('connection', (ws) => {
    console.log('Cliente conectado!');

    // Envia o contador e histórico iniciais para o novo cliente
    ws.send(JSON.stringify({ tipo: 'contador-viagens', contador: contadorViagens }));
    ws.send(JSON.stringify({ tipo: 'historico', historico }));

    ws.on('message', (data) => {
        const mensagem = JSON.parse(data);

        if (mensagem.tipo === 'incrementar-viagem') {
            contadorViagens++;
            saveContador();

            wss.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ tipo: 'contador-viagens', contador: contadorViagens }));
                }
            });
        } else if (mensagem.tipo === 'entrada-carregamento' || mensagem.tipo === 'saida-carregamento') {
            const { carretaId, hora } = mensagem;
            const tipo = mensagem.tipo === 'entrada-carregamento' ? 'Entrada' : 'Saída';

            // Atualiza o histórico no servidor
            if (!historico[carretaId]) {
                historico[carretaId] = [];
            }
            historico[carretaId].push(`${tipo}: ${hora}`);
            saveHistorico();

            // Envia o histórico atualizado para todos os clientes conectados
            wss.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({
                        tipo: 'historico',
                        historico: historico[carretaId]
                    }));
                }
            });
        }
    });

    ws.on('close', () => {
        console.log('Cliente desconectado!');
    });
});
