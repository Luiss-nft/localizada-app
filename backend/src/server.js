const { WebSocketServer } = require("ws");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const wss = new WebSocketServer({ port: process.env.PORT || 8080 });

const contadorFilePath = path.join(__dirname, "contadorViagem.json");
const historicoFilePath = path.join(__dirname, "historicoCarretas.json");
const statusFilePath = path.join(__dirname, "statusCarretas.json");
const descarregamentoFilePath = path.join(__dirname, "historicoDescarregamento.json");

let contadorViagens = 0;
let historicoCarretas = {};
let statusCarretas = {};
let descarregamentoHistorico = {};

// Função para ler um arquivo JSON
function readFile(filePath) {
    try {
        const data = fs.readFileSync(filePath);
        return JSON.parse(data);
    } catch (error) {
        console.error(`Erro ao ler ${filePath}:`, error);
        return {};
    }
}

// Função para salvar um objeto em um arquivo JSON
function saveFile(filePath, data) {
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, jsonData);
}

contadorViagens = readFile(contadorFilePath).contador || 0;
historicoCarretas = readFile(historicoFilePath);
statusCarretas = readFile(statusFilePath);
descarregamentoHistorico = readFile(descarregamentoFilePath);

console.log(`Servidor WebSocket rodando na porta ${process.env.PORT || 8080}`);

wss.on("connection", (ws) => {
    console.log("Cliente conectado!");

    // Envia o estado inicial para o novo cliente
    ws.send(JSON.stringify({ tipo: 'contador-viagens', contador: contadorViagens }));
    ws.send(JSON.stringify({ tipo: 'carregar-historico', historico: historicoCarretas }));
    ws.send(JSON.stringify({ tipo: 'carregar-status', status: statusCarretas }));
    ws.send(JSON.stringify({ tipo: 'carregar-historico-descarregamento', historico: descarregamentoHistorico }));

    ws.on("error", console.error);

    ws.on("message", (data) => {
        console.log("Mensagem recebida:", data);

        const mensagem = JSON.parse(data);
        const { tipo, carretaId, hora } = mensagem;

        if (mensagem.tipo === 'incrementar-viagem') {
            contadorViagens++;
            saveFile(contadorFilePath, { contador: contadorViagens });

            // Envia o novo contador para todos os clientes conectados
            wss.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ tipo: 'contador-viagens', contador: contadorViagens }));
                }
            });
        } else if (mensagem.tipo === 'finalizar-viagem') {
            contadorViagens = 0;
            saveFile(contadorFilePath, { contador: contadorViagens });

            // Envia o contador zerado para todos os clientes
            wss.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ tipo: 'contador-viagens', contador: contadorViagens }));
                }
            });
        } else if (mensagem.tipo === 'entrada-carregamento' || mensagem.tipo === 'saida-carregamento') {
            const { tipo, carretaId, hora } = mensagem;
            historicoCarretas[carretaId] = historicoCarretas[carretaId] || [];
            historicoCarretas[carretaId].push(`${tipo === 'entrada-carregamento' ? 'Entrada:' : 'Saída:'} ${hora}`);
            saveFile(historicoFilePath, historicoCarretas);

            // Atualiza o status da carreta
            if (tipo === 'entrada-carregamento') {
                statusCarretas[carretaId] = 'Aguardando Carregamento';
            } else if (tipo === 'saida-carregamento') {
                statusCarretas[carretaId] = 'Em Percurso para Campo';
            }
            saveFile(statusFilePath, statusCarretas);

            // Envia o histórico e status atualizados para todos os clientes conectados
            wss.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ tipo: 'atualizar-historico', carretaId, historico: historicoCarretas[carretaId] }));
                    client.send(JSON.stringify({ tipo: 'atualizar-status', carretaId, status: statusCarretas[carretaId] }));
                }
            });
        } else if (mensagem.tipo === 'entrada-descarregamento' || mensagem.tipo === 'saida-descarregamento') {
            descarregamentoHistorico[carretaId] = descarregamentoHistorico[carretaId] || [];
            descarregamentoHistorico[carretaId].push(`${tipo === 'entrada-descarregamento' ? 'Entrada:' : 'Saída:'} ${hora}`);
            saveFile(descarregamentoFilePath, descarregamentoHistorico);

            // Envia o histórico atualizado para todos os clientes conectados
            wss.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ tipo: 'atualizar-historico-descarregamento', carretaId, historico: descarregamentoHistorico[carretaId] }));
                }
            });
        } else if (mensagem.tipo === 'limpar-historico') {
            const { carretaId } = mensagem;
            historicoCarretas[carretaId] = [];
            statusCarretas[carretaId] = 'Sem status';
            saveFile(historicoFilePath, historicoCarretas);
            saveFile(statusFilePath, statusCarretas);

            // Envia o histórico e status zerados para todos os clientes conectados
            wss.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ tipo: 'atualizar-historico', carretaId, historico: historicoCarretas[carretaId] }));
                    client.send(JSON.stringify({ tipo: 'atualizar-status', carretaId, status: statusCarretas[carretaId] }));
                }
            });
        } else if (mensagem.tipo === 'limpar-historico-descarregamento') {
            const { carretaId } = mensagem;
            descarregamentoHistorico[carretaId] = [];
            saveFile(descarregamentoFilePath, descarregamentoHistorico);

            // Envia o histórico zerado para todos os clientes conectados
            wss.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ tipo: 'atualizar-historico-descarregamento', carretaId, historico: descarregamentoHistorico[carretaId] }));
                }
            });
        } else if (mensagem.tipo === 'resetar-status') {
            const { carretaId, status } = mensagem;
            statusCarretas[carretaId] = status;
            saveFile(statusFilePath, statusCarretas);

            // Envia o status atualizado para todos os clientes conectados
            wss.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ tipo: 'atualizar-status', carretaId, status }));
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
