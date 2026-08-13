# LUZ ACIMA 72

Protótipo interativo de um sistema solar anfíbio para preservar cargas vitais durante 72 horas de inundação em Moçambique.

## Modelo

- Campo solar elevado de 2 kWp em duas séries.
- Bateria LiFePO4 de 10 kWh e inversor de 2 kVA.
- Orçamento P1/P2 de 2,25 kWh/dia.
- Plataforma com quatro tambores HDPE de 200 L, guias verticais e cabo com laço de serviço.
- Isolamento elétrico por geometria insegura, bloqueio, fuga ou falha de sensor.
- Pack portátil independente para rádio/VHF e iluminação de emergência.

Os valores são ilustrativos e devem ser validados por ensaios, projeto estrutural, proteção elétrica certificada e cotações locais.

## Executar

Abra `index.html` ou inicie o servidor usado pelos testes:

```powershell
node tests/server.mjs
```

Depois aceda a `http://127.0.0.1:4173`.

## Testes

```powershell
npm test
```
