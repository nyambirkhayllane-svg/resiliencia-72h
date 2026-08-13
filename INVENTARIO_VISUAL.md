# Inventário visual — RESILIÊNCIA 72H

## Controlos

- Botões: `juryBtn` — “▶ Demonstração para o júri”; `demoPauseBtn` — “Ⅱ Pausar”; `demoResetBtn` — “↻ Reiniciar”; `exportBtn` — “↓ CSV”; `stormBtn` — “O ciclone atingiu o sistema”; `runBtn` — “Iniciar simulação de 72 horas”; `resetBtn` — “↻”; `playBtn` — “▶”; `dispatchBtn` — “Despachar kit selecionado”; `injectBtn` — “Aplicar e recalcular”; `mcBtn` — “Executar teste”; `optimizeBtn` — “Encontrar configuração”.
- Seletores: `scenario` — “Cenário”; `strategy` — “Estratégia”; `kitType` — “Kit para o serviço”; `failure` — “Escolher falha…”; `mcRuns` — número de cenários; `targetSurvival` — “Meta conjunta”.
- Evento climático: `cloud` — “Nuvens (%)”; `wind` — “Vento (km/h)”; `rain` — “Precipitação (mm)”; `panelDamage` — “Danos solares (%)”; `roadsClose` — “Estradas cortadas (h)”; `flightWindow` — “Janela de voo (h)”.
- Solar e bateria: `solarKw` — “Solar (kWp)”; `solarEfficiency` — “Eficiência solar (%)”; `batteryKwh` — “Bateria (kWh)”; `initialSoc` — “SOC inicial (%)”; `reserve` — “Reserva (%)”; `maxDischargeKw` — “Descarga máx. (kW)”.
- Biomassa: `biomassKw` — “Potência nominal (kW)”; `biomassKg` — “Combustível (kg)”; `specificConsumption` — “Consumo específico (kg/kWh)”; `biomassMin` — “Potência mínima (kW)”; `dailyFuelLimit` — “Limite diário (kg)”; `biomassAvailable` — “Equipamento disponível”; `wetFuel` — “Combustível húmido”.
- Cargas dinâmicas: “Posto de saúde”, “Rádio e GSM”, “Bomba de água”, “Iluminação comunitária”, “Outras cargas”.
- Playback: `timeSlider` — intervalo temporal 0—71,75 h.
- Monte Carlo: `seed` — “Semente”; `mcRuns` — 100/500/1000.
- Critérios: `healthUptimeTarget` — “Uptime mínimo da saúde (%)”; `commsUptimeTarget` — “Uptime mínimo das comunicações (%)”; `dailyWaterTargetLitres` — “Meta diária de água (L/dia)”; `minimumWaterLitresPerPersonDay` — “Água mínima (L/pessoa/dia)”; `healthUsers` — “Utilizadores do posto de saúde”; `maxCriticalBlackoutMinutes` — “Blackout crítico contínuo máximo (min)”.
- Dimensionamento: `maxBudget` — “Custo máximo (USD)”; pares `solarOptMin`/`solarOptMax`, `batteryOptMin`/`batteryOptMax`, `bioOptMin`/`bioOptMax`, `fuelOptMin`/`fuelOptMax`; `optKits` — “Número de kits”; `costSolar`, `costBattery`, `costBiomass`, `costFuel`, `costKit` — custos unitários.

## Disclosures

- Evento climático; Sistema solar e bateria; Biomassa; Cargas e estratégia; Critérios de sobrevivência; Cobertura de pessoas; Balanço energético; Bateria; Biomassa; Índice de Resiliência; Dados por validar.

## Resultados e estados

- `demoStatus`, `convState`, `resState`, `convServices`, `resServices`, `convResults`, `resResults`.
- `timelineChart`, `eventRail`, `timeLabel`, `decisionTitle`, `decisionText`.
- `flightStatus`, `communityMap`, `missionProgress`, `missionStatus`, `recommendation`, `missionLog`.
- `failureLog`, `mcProgress`, `survivalMatrix`, `convProbability`, `resProbability`, `convBar`, `resBar`, `mcStats`, `mcSurvivalChart`, `mcHistogramChart`, `mcSensitivityChart`, `mcConclusion`.
- `optProgress`, `optResult`, `healthRuleTarget`, `healthAllowed`, `commsRuleTarget`, `commsAllowed`, `blackoutRuleTarget`, `blackoutAllowed`.

Este inventário é a referência de regressão para a verificação final.
