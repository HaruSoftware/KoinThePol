# KoinThePol

Aplicacao para estimar a direcao do Bitcoin nas proximas 1 e 4 horas usando candles intradiarios da Binance e acompanhar os mercados up/down da Polymarket.

## Configuracao

1. Instale as dependencias com `npm install`.
2. Opcionalmente, ajuste `BINANCE_API_URL` no arquivo `.env`.

A API nao usa banco de dados. A primeira consulta de cada mercado busca os candles BTCUSDT de 5 minutos das ultimas 24 horas, calcula a probabilidade usando o preco de referencia da Polymarket e salva o resultado em `data/forecast-cache.json`. O mesmo mercado reutiliza a previsao mesmo apos reiniciar a API; um novo mercado recebe uma nova previsao.

## API

- `POST /api/collect/1h`: conecta ao mercado atual de Bitcoin up/down de 1 hora.
- `POST /api/collect/4h`: conecta ao mercado atual de Bitcoin up/down de 4 horas.
- `GET /api/collect/1h/latest`: retorna a previsao fixa para a proxima hora.
- `GET /api/collect/4h/latest`: retorna a previsao fixa para as proximas 4 horas.
- `GET /api/collect/1h/status`: informa se o WebSocket do mercado 1h está conectado.
- `GET /api/collect/4h/status`: informa se o WebSocket do mercado 4h está conectado.
- `POST /api/update`: gera uma previsao `UP` ou `DOWN` de 4 horas em memoria.
- `GET /api/health`: verifica se a API esta funcionando.

A coleta inicial acontece somente quando a rota correspondente e chamada. O servidor nao executa loops ou agendamentos automaticos. O mercado continua recebendo atualizacoes pelo WebSocket depois que a rota de coleta correspondente e chamada. A selecao usa a janela de tempo atual, escolhe o mercado vigente mais recentemente iniciado e ignora mercados antigos.

O dashboard e somente leitura: ele consulta o status do WebSocket e a previsao persistida do mercado atual. O cache local nao e versionado.

## Comandos

- `npm run dev`: frontend Vite.
- `npm run server:dev`: API e agendamentos.
- `npm run build`: build do frontend.
- `npm run server:build`: build do backend.
