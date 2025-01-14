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
const calculoAduboFilePath = path.join(__dirname, "calculoAdubo.json"); // Novo arquivo JSON para salvar os cálculos

// Funções auxiliares para manipulação de arquivos
function ensureFileExists(filePath, defaultData) {
    if (!fs.existsSync(filePath)) {
        saveFile(filePath, defaultData);
    }
}

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
    try {
        const jsonData = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, jsonData);
    } catch (error) {
        console.error(`Erro ao salvar ${filePath}:`, error);
    }
}

// Função para salvar os dados do cálculo de adubo em um arquivo JSON
function saveAduboToFile(data) {
    console.log("Salvando dados no arquivo calculoAdubo.json:", data); // Log para depuração
    try {
        const jsonData = JSON.stringify(data, null, 2);
        fs.writeFileSync(calculoAduboFilePath, jsonData);
        console.log("Dados salvos em calculoAdubo.json");
    } catch (error) {
        console.error("Erro ao salvar arquivo JSON:", error);
    }
}

// Inicialização dos dados
ensureFileExists(contadorFilePath, { contador: 0 });
ensureFileExists(historicoFilePath, {});
ensureFileExists(statusFilePath, {});
ensureFileExists(descarregamentoFilePath, {});

let contadorViagens = readFile(contadorFilePath).contador;
let historicoCarretas = readFile(historicoFilePath);
let statusCarretas = readFile(statusFilePath);
let descarregamentoHistorico = readFile(descarregamentoFilePath);

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

                case 'entrada-descarregamento':
                case 'saida-descarregamento':
                    if (carretaId && hora) {
                        descarregamentoHistorico[carretaId] = descarregamentoHistorico[carretaId] || [];
                        descarregamentoHistorico[carretaId].push(`${tipo === 'entrada-descarregamento' ? 'Entrada:' : 'Saída:'} ${hora}`);
                        saveFile(descarregamentoFilePath, descarregamentoHistorico);

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

                case 'salvar-adubo':
                    console.log("Dados para salvar:", mensagem); // Log para depuração
                    // Salva os dados do cálculo de adubo em um arquivo JSON
                    saveAduboToFile(mensagem);
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
