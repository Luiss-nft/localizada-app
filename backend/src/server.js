const { WebSocketServer } = require("ws");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const wss = new WebSocketServer({ port: process.env.PORT || 8080 });

// Caminhos dos arquivos JSON
const contadorFilePath = path.join(__dirname, "contadorViagem.json");
const historicoFilePath = path.join(__dirname, "historicoCarretas.json");
const statusFilePath = path.join(__dirname, "statusCarretas.json");
const descarregamentoFilePath = path.join(__dirname, "historicoDescarregamento.json");

// Inicialização dos dados
let contadorViagens = 0;
let historicoCarretas = {};
let statusCarretas = {};
let descarregamentoHistorico = {};

// Funções auxiliares para manipulação de arquivos
function readFile(filePath) {
    try {
        const data = fs.readFileSync(filePath);
        return JSON.parse(data);
    } catch (error) {
        console.error(`Erro ao ler ${filePath}:`, error);
        return {};
    }
}

function saveFile(filePath, data) {
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, jsonData);
}

// Carrega os dados iniciais
contadorViagens = readFile(contadorFilePath).contador || 0;
historicoCarretas = readFile(historicoFilePath);
statusCarretas = readFile(statusFilePath);
descarregamentoHistorico = readFile(descarregamentoFilePath);

console.log(`Servidor WebSocket rodando na porta ${process.env.PORT || 8080}`);

// Enviar dados para todos os clientes conectados
function broadcast(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// WebSocket Connection
wss.on("connection", (ws) => {
    console.log("Cliente conectado!");

    // Envia os dados iniciais para o cliente conectado
    ws.send(JSON.stringify({ tipo: 'contador-viagens', contador: contadorViagens }));
    ws.send(JSON.stringify({ tipo: 'carregar-historico', historico: historicoCarretas }));
    ws.send(JSON.stringify({ tipo: 'carregar-status', status: statusCarretas }));
    ws.send(JSON.stringify({ tipo: 'carregar-historico-descarregamento', historico: descarregamentoHistorico }));

    ws.on("error", console.error);

    ws.on("message", (data) => {
        try {
            const mensagem = JSON.parse(data);
            const { tipo, carretaId, hora } = mensagem;

            switch (tipo) {
                case 'incrementar-viagem':
                    contadorViagens++;
                    saveFile(contadorFilePath, { contador: contadorViagens });
                    broadcast({ tipo: 'contador-viagens', contador: contadorViagens });
                    break;

                case 'finalizar-viagem':
                    contadorViagens = 0;
                    saveFile(contadorFilePath, { contador: contadorViagens });
                    broadcast({ tipo: 'contador-viagens', contador: contadorViagens });
                    break;

                // Carregamento
                case 'entrada-carregamento':
                case 'saida-carregamento':
                    if (carretaId && hora) {
                        historicoCarretas[carretaId] = historicoCarretas[carretaId] || [];
                        historicoCarretas[carretaId].push(`${tipo === 'entrada-carregamento' ? 'Entrada:' : 'Saída:'} ${hora}`);
                        saveFile(historicoFilePath, historicoCarretas);

                        statusCarretas[carretaId] = tipo === 'entrada-carregamento'
                            ? 'Aguardando Carregamento'
                            : 'Em Percurso para Campo';
                        saveFile(statusFilePath, statusCarretas);

                        broadcast({ tipo: 'atualizar-historico', carretaId, historico: historicoCarretas[carretaId] });
                        broadcast({ tipo: 'atualizar-status', carretaId, status: statusCarretas[carretaId] });
                    }
                    break;

                // Descarregamento
                case 'entrada-descarregamento':
                case 'saida-descarregamento':
                    if (carretaId && hora) {
                        descarregamentoHistorico[carretaId] = descarregamentoHistorico[carretaId] || [];
                        descarregamentoHistorico[carretaId].push(`${tipo === 'entrada-descarregamento' ? 'Entrada:' : 'Saída:'} ${hora}`);
                        saveFile(descarregamentoFilePath, descarregamentoHistorico);

                        // Atualizando o status da carreta no descarregamento
                        if (tipo === 'entrada-descarregamento') {
                            statusCarretas[carretaId] = 'Aguardando Descarregamento';
                        } else if (tipo === 'saida-descarregamento') {
                            statusCarretas[carretaId] = 'Em Percurso para Poço';
                        }
                        saveFile(statusFilePath, statusCarretas);

                        broadcast({ tipo: 'atualizar-historico-descarregamento', carretaId, historico: descarregamentoHistorico[carretaId] });
                        broadcast({ tipo: 'atualizar-status', carretaId, status: statusCarretas[carretaId] });
                    }
                    break;

                case 'limpar-historico':
                    if (carretaId) {
                        historicoCarretas[carretaId] = [];
                        statusCarretas[carretaId] = 'Sem status';
                        saveFile(historicoFilePath, historicoCarretas);
                        saveFile(statusFilePath, statusCarretas);

                        broadcast({ tipo: 'atualizar-historico', carretaId, historico: historicoCarretas[carretaId] });
                        broadcast({ tipo: 'atualizar-status', carretaId, status: statusCarretas[carretaId] });
                    }
                    break;

                case 'limpar-historico-descarregamento':
                    if (carretaId) {
                        descarregamentoHistorico[carretaId] = [];
                        saveFile(descarregamentoFilePath, descarregamentoHistorico);

                        broadcast({ tipo: 'atualizar-historico-descarregamento', carretaId, historico: descarregamentoHistorico[carretaId] });
                    }
                    break;

                case 'resetar-status':
                    if (carretaId && mensagem.status) {
                        statusCarretas[carretaId] = mensagem.status;
                        saveFile(statusFilePath, statusCarretas);

                        broadcast({ tipo: 'atualizar-status', carretaId, status: mensagem.status });
                    }
                    break;

                default:
                    console.log("Tipo de mensagem não reconhecido:", mensagem.tipo);
            }
        } catch (error) {
            console.error("Erro ao processar mensagem:", error);
        }
    });

    ws.on("close", () => {
        console.log("Cliente desconectado!");
    });
});
