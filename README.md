# KoinThePol

Aplicacao para coletar mercados de Bitcoin up/down da Polymarket e registrar previsoes em PostgreSQL.

## Configuracao

1. Crie um banco PostgreSQL chamado `kointhepol`.
2. Ajuste o arquivo `.env` com a sua `DATABASE_URL`.
3. Instale as dependencias com `npm install`.

Ao iniciar a API, as tabelas `market_snapshots` e `predictions` sao criadas automaticamente.

## API

- `POST /api/collect/1h`: busca o mercado atual de Bitcoin up/down de 1 hora, salva o JSON bruto e retorna o snapshot.
- `POST /api/collect/4h`: busca o mercado atual de Bitcoin up/down de 4 horas, salva o snapshot inicial e abre a assinatura WebSocket.
- `GET /api/collect/1h/latest`: retorna o ultimo JSON de 1 hora salvo no banco.
- `GET /api/collect/4h/latest`: retorna o ultimo JSON de 4 horas salvo no banco.
- `GET /api/collect/4h/status`: informa se o WebSocket do mercado 4h está conectado.
- `POST /api/update`: cria uma previsao `UP` ou `DOWN` usando o ultimo snapshot coletado.
- `GET /api/health`: verifica a conexao com o banco.

A coleta inicial acontece somente quando a rota correspondente e chamada. O servidor nao executa loops ou agendamentos automaticos. O mercado 4h continua recebendo atualizacoes pelo WebSocket depois que `/api/collect/4h` e chamado. A selecao usa a janela de tempo atual e ignora mercados antigos.

## Comandos

- `npm run dev`: frontend Vite.
- `npm run server:dev`: API e agendamentos.
- `npm run build`: build do frontend.
- `npm run server:build`: build do backend.
