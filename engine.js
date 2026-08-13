export const LOADS = [
  { id: "saude", nome: "Posto de saúde", power: 2.4, start: 0, end: 24, priority: 1, critical: true, interruptible: false, surge: 1.25 },
  { id: "comms", nome: "Rádio e GSM", power: 0.8, start: 0, end: 24, priority: 2, critical: true, interruptible: false, surge: 1.2 },
  { id: "agua", nome: "Bomba de água", power: 3.1, start: 6, end: 18, priority: 3, critical: true, interruptible: true, surge: 1.35 },
  { id: "luz", nome: "Iluminação comunitária", power: 1.8, start: 18, end: 23, priority: 4, critical: false, interruptible: true, surge: 1.1 },
  { id: "outras", nome: "Outras cargas", power: 2.2, start: 7, end: 21, priority: 5, critical: false, interruptible: true, surge: 1.0 }
];

export const DEFAULTS = {
  duration: 72, timeStepHours: .25, scenario: "severo", cloud: 78, wind: 70, rain: 160, roadsClose: 5, flightWindow: 34, panelDamage: 35,
  solarKw: 28, solarEfficiency: 82, solarLoss: 14,
  batteryKwh: 140, initialSoc: 92, maxDod: 88, chargeEfficiency: 94, dischargeEfficiency: 92, maxChargeKw: 28, maxDischargeKw: 28, reserve: 12,
  biomassKw: 14, biomassKg: 290, specificConsumption: 1.05, biomassEfficiency: 78, biomassMin: 3, biomassAvailable: true, dailyFuelLimit: 110, wetFuel: false,
  strategy: "vida", loads: LOADS.map(x => ({...x})), people: 1240, healthUsers: 180, minimumWaterLitresPerPersonDay: 15, waterLitresPerKwh: 1650,
  healthUptimeTarget: 99, commsUptimeTarget: 95, dailyWaterTargetLitres: 18600, maxCriticalBlackoutMinutes: 60
};

const daylight = h => h >= 6 && h <= 18 ? Math.sin(((h - 6) / 12) * Math.PI) : 0;
const scenarioFactor = s => ({ normal: .92, moderado: .55, severo: .27, extremo: .12, semsol: .03 }[s] ?? .27);
const active = (load, h) => load.start <= load.end ? h >= load.start && h < load.end : h >= load.start || h < load.end;
export const allowedFailureIntervals=(requested,targetPercent)=>Math.floor(requested*(1-targetPercent/100)+1e-9);

function orderLoads(loads, strategy) {
  if (strategy === "eficiencia") return [...loads].sort((a,b) => (a.power / (a.critical ? 2 : 1)) - (b.power / (b.critical ? 2 : 1)));
  if (strategy === "igual") return [...loads];
  return [...loads].sort((a,b) => a.priority - b.priority);
}

export function simulate(input, type="resiliente") {
  const p = structuredClone(input), result = [], events = [], diagnostics = [];
  const intervalHours=p.timeStepHours??.25,steps=Math.round(p.duration/intervalHours),stepsPerDay=Math.round(24/intervalHours);
  const usableFloor = Math.max((1-p.maxDod/100)*p.batteryKwh, p.reserve/100*p.batteryKwh);
  let battery = p.batteryKwh*p.initialSoc/100, fuel=p.biomassKg, firstCriticalBlackout=null, totalUnserved=0, criticalUnserved=0, biomassUsed=0, dailyBiomassUsed=0, fuelExhaustedAt=null, curtailed=0, criticalBlackoutRun=0, maxCriticalBlackoutRun=0;
  const biomassEventKeys=new Set();
  const uptime=Object.fromEntries(p.loads.map(l=>[l.id,0])), requestedHours=Object.fromEntries(p.loads.map(l=>[l.id,0]));
  for(let step=0;step<steps;step++){
    const t=step*intervalHours,h=t%24, storm=t>=2, damaged=storm?p.panelDamage/100:0;
    if(step%stepsPerDay===0)dailyBiomassUsed=0;
    const cloudFactor=storm?(1-p.cloud/100):.9;
    const solar=p.solarKw*daylight(h)*scenarioFactor(p.scenario)*cloudFactor*(p.solarEfficiency/100)*(1-p.solarLoss/100)*(1-damaged);
    const demands=p.loads.map(l=>({ ...l, demand:active(l,h)?l.power*(storm?l.surge:1):0 }));
    const totalDemand=demands.reduce((s,l)=>s+l.demand,0);
    let bioRequested=0,bio=0,bioEnergy=0,bioFuelUsed=0,humidityReduction=0;
    let biomassLimitation="Gerador não aplicável ao sistema convencional",biomassState="not_applicable";
    let nominalCap=0,humidityCap=0,fuelCap=0,dailyCap=0;
    const fuelBefore=fuel;
    if(type==="resiliente"){
      nominalCap=p.biomassKw;humidityCap=nominalCap*(p.wetFuel?.65:1);
      fuelCap=fuel/(p.specificConsumption*intervalHours);
      dailyCap=Math.max(0,p.dailyFuelLimit-dailyBiomassUsed)/(p.specificConsumption*intervalHours);
      if(!p.biomassAvailable){biomassLimitation="Gerador indisponível por avaria ou restrição operacional";biomassState="unavailable";}
      else if(fuel<=.001){biomassLimitation="Combustível de biomassa fisicamente esgotado";biomassState="fuel_exhausted";}
      else{
        const forecastRisk=battery<usableFloor+p.batteryKwh*.28||solar<totalDemand*.55;
        if(!forecastRisk){biomassLimitation="Arranque não solicitado pelo controlador";biomassState="standby";}
        else{
          const chargeRequest=Math.min(p.maxChargeKw,Math.max(0,usableFloor+p.batteryKwh*.28-battery)/intervalHours);
          bioRequested=Math.max(p.biomassMin,totalDemand-solar+chargeRequest);
          const availablePower=Math.min(bioRequested,nominalCap,humidityCap,fuelCap,dailyCap);
          humidityReduction=Math.max(0,Math.min(bioRequested,nominalCap)-Math.min(bioRequested,humidityCap));
          const limitations=[];
          if(bioRequested>nominalCap+.001)limitations.push("Potência nominal atingida");
          if(p.wetFuel&&humidityCap<Math.min(bioRequested,nominalCap)-.001)limitations.push("Combustível húmido reduziu a potência");
          if(fuelCap<Math.min(bioRequested,nominalCap,humidityCap)-.001)limitations.push("Combustível restante limitou a produção");
          if(dailyCap<Math.min(bioRequested,nominalCap,humidityCap,fuelCap)-.001)limitations.push("Limite diário de combustível atingido");
          if(dailyCap<p.biomassMin-.001&&fuelCap>=p.biomassMin-.001&&fuel>.001){biomassState="daily_limit";biomassLimitation="Limite diário de combustível atingido";}
          else if(availablePower>0&&availablePower<p.biomassMin){biomassState=p.wetFuel?"unavailable":"power_limited";biomassLimitation=[...limitations,"Potência disponível inferior à potência mínima estável"].join("; ");}
          else{bio=Math.max(0,availablePower);biomassLimitation=limitations.join("; ")||"Sem limitação ativa";biomassState=limitations.length?"power_limited":"producing";}
        }
      }
    }
    bioEnergy=bio*intervalHours;
    bioFuelUsed=bioEnergy*p.specificConsumption;
    fuel=Math.max(0,fuel-bioFuelUsed);biomassUsed+=bioFuelUsed;dailyBiomassUsed+=bioFuelUsed;
    if(fuelExhaustedAt===null&&fuelBefore>0&&fuel<=.001)fuelExhaustedAt=t+intervalHours;
    const futureUsablePower=p.biomassAvailable?Math.min(p.biomassKw,p.biomassKw*(p.wetFuel?.65:1),p.dailyFuelLimit/(p.specificConsumption*24)):0;
    const biomassHoursRemaining=fuel<=.001?0:futureUsablePower>0?fuel/(futureUsablePower*p.specificConsumption):null;
    const biomassExhaustionHour=biomassHoursRemaining===null?null:t+intervalHours+biomassHoursRemaining;
    const generated=solar+bio; let direct=Math.min(generated,totalDemand), surplus=Math.max(0,generated-totalDemand), deficit=Math.max(0,totalDemand-generated);
    let charged=Math.min(surplus*intervalHours*p.chargeEfficiency/100,p.maxChargeKw*intervalHours,p.batteryKwh-battery); battery+=charged;curtailed+=Math.max(0,surplus*intervalHours-charged/(p.chargeEfficiency/100));
    const available=Math.max(0,battery-usableFloor),batteryTheoreticalOut=available*p.dischargeEfficiency/100/intervalHours,dischargeOut=Math.min(deficit,p.maxDischargeKw,batteryTheoreticalOut);battery-=dischargeOut*intervalHours/(p.dischargeEfficiency/100);
    const grossTheoreticalSupply=solar+bio+batteryTheoreticalOut,usableSupply=direct+dischargeOut,systemLosses=dischargeOut>0?dischargeOut/(p.dischargeEfficiency/100)-dischargeOut:0;
    let supply=usableSupply, served={};
    if(type==="convencional"||p.strategy==="igual"){
      const ratio=totalDemand?Math.min(1,supply/totalDemand):1;demands.forEach(l=>served[l.id]=l.demand*ratio);
    }else{ orderLoads(demands,p.strategy).forEach(l=>{served[l.id]=Math.min(l.demand,supply);supply-=served[l.id]}); }
    let unserved=0,criticalStep=0;demands.forEach(l=>{const miss=l.demand-(served[l.id]||0);unserved+=miss;if(l.critical)criticalStep+=miss;if(l.demand>0){requestedHours[l.id]++;if(miss<.01)uptime[l.id]++;}});
    const allocatedTotal=Object.values(served).reduce((sum,value)=>sum+value,0),criticalLoads=demands.filter(l=>l.critical),criticalDemandNow=criticalLoads.reduce((sum,l)=>sum+l.demand,0),criticalServed=criticalLoads.reduce((sum,l)=>sum+(served[l.id]||0),0);
    if(criticalStep>.01){criticalBlackoutRun++;maxCriticalBlackoutRun=Math.max(maxCriticalBlackoutRun,criticalBlackoutRun);}else criticalBlackoutRun=0;
    if(criticalStep>.01&&firstCriticalBlackout===null){firstCriticalBlackout=t;events.push({t,label:`Primeiro blackout crítico: hora ${t}`,kind:"blackout"});}
    if(t===2)events.push({t,label:"O ciclone atingiu o sistema",kind:"storm"});if(t===p.roadsClose)events.push({t,label:"Estradas interrompidas",kind:"road"});if(t===p.flightWindow)events.push({t,label:"Janela segura para drones",kind:"drone"});if(bio>0&&!result.some(r=>r.bio>0))events.push({t,label:"Biomassa accionada",kind:"bio"});
    if(biomassState==="daily_limit"&&!biomassEventKeys.has(`daily-${Math.floor(t/24)}`)){events.push({t,label:`Geração por biomassa suspensa — limite diário atingido; ${fuel.toFixed(0)} kg permanecem em reserva.`,kind:"fuel-limit"});biomassEventKeys.add(`daily-${Math.floor(t/24)}`);}
    totalUnserved+=unserved*intervalHours;criticalUnserved+=criticalStep*intervalHours;
    if(criticalStep>.01){
      const causes=[];
      if(battery<=usableFloor+.001)causes.push({code:"battery_reserve",label:"Bateria atingiu a reserva mínima",weight:10});
      if(dischargeOut>=p.maxDischargeKw-.001&&deficit>dischargeOut+.01)causes.push({code:"inverter_limit",label:"Limite de potência do inversor/bateria",weight:9});
      if(type==="resiliente"&&!p.biomassAvailable)causes.push({code:"generator_unavailable",label:"Gerador de biomassa indisponível",weight:10});
      if(type==="resiliente"&&fuelBefore<=.01)causes.push({code:"fuel_exhausted",label:"Combustível de biomassa esgotado",weight:10});
      if(type==="resiliente"&&p.wetFuel&&bio<p.biomassKw)causes.push({code:"wet_fuel",label:"Combustível húmido reduziu a potência",weight:8});
      if(type==="resiliente"&&biomassLimitation!=="Sem limitação ativa"&&biomassLimitation!=="Arranque não solicitado pelo controlador"&&bioRequested>bio+.01)causes.push({code:"biomass_limited",label:`Biomassa limitada: ${biomassLimitation}`,weight:9});
      if(p.panelDamage>0)causes.push({code:"panel_damage",label:`Painéis danificados (${p.panelDamage}%)`,weight:7});
      if(p.cloud>20)causes.push({code:"clouds",label:`Produção solar reduzida por nuvens (${p.cloud}%)`,weight:6});
      if(criticalDemandNow>usableSupply+.01)causes.push({code:"demand_exceeded",label:"Procura crítica total excedeu a oferta efetivamente utilizável",weight:9});
      if(criticalDemandNow<=usableSupply+.01&&criticalServed<criticalDemandNow-.01)causes.push({code:"already_allocated",label:"Energia já atribuída a outras cargas pela estratégia de distribuição",weight:9});
      if(systemLosses>.01)causes.push({code:"system_losses",label:`Perdas da descarga da bateria (${systemLosses.toFixed(2)} kW equivalentes)`,weight:5});
      causes.sort((a,b)=>b.weight-a.weight);
      const affected=criticalLoads.filter(l=>l.demand-(served[l.id]||0)>.01),affectedDemand=affected.reduce((sum,l)=>sum+l.demand,0),affectedServed=affected.reduce((sum,l)=>sum+(served[l.id]||0),0),affectedDeficit=affectedDemand-affectedServed;
      affected.forEach(l=>diagnostics.push({t,serviceId:l.id,service:l.nome,demand:l.demand,served:served[l.id]||0,unserved:l.demand-(served[l.id]||0),criticalDemand:criticalDemandNow,criticalServed,criticalDeficit:criticalDemandNow-criticalServed,affectedDemand,affectedServed,affectedDeficit,solarUsable:solar,biomassUsable:bio,batteryDischargeAllowed:dischargeOut,grossTheoreticalSupply,usableSupply,allocatedTotal,allocations:{...served},systemLosses,soc:battery/p.batteryKwh*100,reserveSoc:usableFloor/p.batteryKwh*100,fuelRemaining:fuel,loadAction:(served[l.id]||0)<.01?"Desligada":"Parcialmente desligada",primaryCause:causes[0]?.label||"Energia insuficiente após restrições e distribuição",contributingCauses:causes.slice(1,4).map(c=>c.label),causeCodes:causes.map(c=>c.code)}));
    }
    result.push({t,solar,bio,demand:totalDemand,criticalDemand:criticalDemandNow,criticalServed,discharge:dischargeOut,grossTheoreticalSupply,usableSupply,allocatedTotal,systemLosses,soc:battery/p.batteryKwh*100,fuelRemaining:fuel,biomassRequestedKw:bioRequested,biomassNominalKw:p.biomassKw,biomassFuelPowerCapKw:fuelCap,biomassDailyPowerCapKw:dailyCap,biomassProducedKw:bio,biomassEnergyKwh:bioEnergy,biomassFuelUsedKg:bioFuelUsed,biomassUsedKg:biomassUsed,biomassHumidityReductionKw:humidityReduction,biomassHoursRemaining,biomassExhaustionHour,biomassState,biomassLimitation,reserveSoc:usableFloor/p.batteryKwh*100,unserved,criticalUnserved:criticalStep,served});
  }
  const up=id=>requestedHours[id]?uptime[id]/requestedHours[id]*100:100, waterServed=result.reduce((s,r)=>s+(r.served.agua||0)*intervalHours,0)*p.waterLitresPerKwh;
  const waterByDay=Array.from({length:Math.ceil(p.duration/24)},(_,day)=>result.filter(r=>Math.floor(r.t/24)===day).reduce((s,r)=>s+(r.served.agua||0)*intervalHours,0)*p.waterLitresPerKwh);
  const criticalDemand=result.reduce((s,r)=>s+p.loads.filter(l=>l.critical).reduce((x,l)=>x+(active(l,r.t%24)?l.power*(r.t>=2?l.surge:1):0)*intervalHours,0),0);
  const isolatedScore=criticalDemand?Math.max(0,1-criticalUnserved/criticalDemand)*100:100;
  const resilience=.4*up("saude")+.25*Math.min(100,waterServed/(p.people*15*3)*100)+.2*up("comms")+.15*isolatedScore;
  const healthFailedIntervals=requestedHours.saude-uptime.saude,commsFailedIntervals=requestedHours.comms-uptime.comms;
  const allowedInterruptions={health:allowedFailureIntervals(requestedHours.saude,p.healthUptimeTarget),comms:allowedFailureIntervals(requestedHours.comms,p.commsUptimeTarget),continuousBlackout:Math.floor(p.maxCriticalBlackoutMinutes/(intervalHours*60)+1e-9)};
  const survival={health:healthFailedIntervals<=allowedInterruptions.health,comms:commsFailedIntervals<=allowedInterruptions.comms,water:waterByDay.length>=3&&waterByDay.slice(0,3).every(v=>v+1e-9>=p.dailyWaterTargetLitres),blackout:maxCriticalBlackoutRun<=allowedInterruptions.continuousBlackout};
  survival.joint=survival.health&&survival.comms&&survival.water&&survival.blackout;
  const minimumDailyWater=Math.min(...waterByDay.slice(0,3));
  const serviceCoverage={
    water:Math.min(p.people,Math.floor(minimumDailyWater/p.minimumWaterLitresPerPersonDay)),
    comms:survival.comms?p.people:0,
    health:survival.health?Math.min(p.people,p.healthUsers):0
  };
  const uniquePeopleProtected=Math.max(serviceCoverage.water,serviceCoverage.comms,serviceCoverage.health);
  if(fuelExhaustedAt!==null){
    const criticalReference=firstCriticalBlackout??p.duration;
    const recalculatedAutonomy=Math.max(0,criticalReference-fuelExhaustedAt);
    events.push({t:Math.min(p.duration-intervalHours,Math.max(0,fuelExhaustedAt)),label:`Biomassa esgotada · autonomia crítica recalculada: ${recalculatedAutonomy.toFixed(1)} h`,kind:"fuel"});
  }
  events.sort((a,b)=>a.t-b.t);
  return {series:result,events,diagnostics,summary:{firstBlackout:firstCriticalBlackout,healthUptime:up("saude"),commsUptime:up("comms"),healthFailedIntervals,commsFailedIntervals,allowedInterruptions,waterLitres:waterServed,waterByDay,maxCriticalBlackoutMinutes:maxCriticalBlackoutRun*intervalHours*60,totalUnserved,criticalUnserved,finalSoc:battery/p.batteryKwh*100,biomassUsed,biomassRemaining:fuel,fuelExhaustedAt,timeStepHours:intervalHours,resilience,serviceCoverage,uniquePeopleProtected,survival}};
}

export function compare(params){return {convencional:simulate(params,"convencional"),resiliente:simulate(params,"resiliente")};}

export function kitAutonomy(usableEnergy, profile, maxPower=Infinity,startHour=0){
  if(usableEnergy<=0||!profile?.length)return 0;
  let energy=usableEnergy,hours=0,index=0;
  while(energy>1e-9&&hours<720){
    const demand=profile[(startHour+index)%profile.length];
    if(demand>maxPower+1e-9)return 0;
    if(demand>0){const step=Math.min(1,energy/demand);hours+=step;energy-=demand*step;if(step<1)break;}else hours++;
    index++;
  }
  return hours;
}

export function validateMission(drone,community,weather,kit){
  const errors=[],profile=kit.loadProfile||[],peak=Math.max(0,...profile),beforeEnergy=community.serviceEnergy?.[kit.service]||0;
  const autonomyBefore=kitAutonomy(beforeEnergy,profile,kit.maxPowerKw,weather.hour%24),autonomyAfter=kitAutonomy(beforeEnergy+kit.usableKwh,profile,kit.maxPowerKw,weather.hour%24);
  const recoveredHours=Math.max(0,autonomyAfter-autonomyBefore);
  if(weather.hour<weather.flightWindow)errors.push(`Janela segura abre na hora ${weather.flightWindow}`);
  if(weather.wind>drone.maxWind)errors.push("Vento acima do limite seguro");
  if(community.distance*2>drone.range)errors.push("Alcance de ida e volta insuficiente");
  if(kit.totalMassKg>drone.payload)errors.push(`Massa total de ${kit.totalMassKg} kg excede a carga útil`);
  if(kit.available<1)errors.push("Kit selecionado indisponível");
  if(!drone.available)errors.push("Drone indisponível");
  if(!community.services?.includes(kit.service))errors.push("Serviço incompatível com esta comunidade");
  if(peak>kit.maxPowerKw+1e-9)errors.push(`Potência do kit insuficiente para o pico de ${peak} kW`);
  if(recoveredHours<.25)errors.push("Energia insuficiente para benefício mensurável");
  return {ok:!errors.length,errors,time:drone.prep+community.distance*2/drone.speed*60,energy:kit.usableKwh,peakKw:peak,autonomyBefore,autonomyAfter,recoveredHours};
}
