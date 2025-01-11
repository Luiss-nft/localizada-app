const { WebSocketServer } = require("ws");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const wss = new WebSocketServer({ port: process.env.PORT || 8080 });

const contadorFilePath = path.join(__dirname, "contadorViagem.json");

let contadorViagens = 0;

// Função para ler o contador de viagens do arquivo JSON
function readContador() {
    try {
        const data = fs.readFileSync(contadorFilePath);
        const parsedData = JSON.parse(data);
        return parsedData.contador || 0;
    } catch (error) {
        console.error("Erro ao ler contador:", error);
        return 0;
    }
}

// Função para salvar o contador de viagens no arquivo JSON
function saveContador() {
    const data = JSON.stringify({ contador: contadorViagens }, null, 2);
    fs.writeFileSync(contadorFilePath, data);
}

contadorViagens = readContador(); // Lê o contador do arquivo

console.log(`Servidor WebSocket rodando na porta ${process.env.PORT || 8080}`);

wss.on("connection", (ws) => {
    console.log("Cliente conectado!");

    // Envia o contador inicial para o novo cliente
    ws.send(JSON.stringify({ tipo: 'contador-viagens', contador: contadorViagens }));

    ws.on("error", console.error);

    ws.on("message", (data) => {
        console.log("Mensagem recebida:", data);
        
        const mensagem = JSON.parse(data); // Parse a mensagem recebida

        if (mensagem.tipo === 'incrementar-viagem') {
            contadorViagens++;
            saveContador(); // Salva no arquivo JSON

            // Envia o novo contador para todos os clientes conectados
            wss.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ tipo: 'contador-viagens', contador: contadorViagens }));
                }
            });
        } else if (mensagem.tipo === 'finalizar-viagem') {
            contadorViagens = 0;
            saveContador(); // Zera e salva no arquivo JSON

            // Envia o contador zerado para todos os clientes
            wss.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ tipo: 'contador-viagens', contador: contadorViagens }));
                }
            });
        } else {
            // Envia a mensagem recebida para todos os outros clientes conectados
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === client.OPEN) {
                    client.send(data.toString());
                }
            });
        }
    });

    ws.on("close", () => {
        console.log("Cliente desconectado!");
    });
});
