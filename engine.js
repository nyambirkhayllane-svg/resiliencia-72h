export const LOADS = [
  { id: "saude", nome: "Posto de saúde", power: 2.4, start: 0, end: 24, priority: 1, critical: true, interruptible: false, surge: 1.25 },
  { id: "comms", nome: "Rádio e GSM", power: 0.8, start: 0, end: 24, priority: 2, critical: true, interruptible: false, surge: 1.2 },
  { id: "agua", nome: "Bomba de água", power: 3.1, start: 6, end: 18, priority: 3, critical: true, interruptible: true, surge: 1.35 },
  { id: "luz", nome: "Iluminação comunitária", power: 1.8, start: 18, end: 23, priority: 4, critical: false, interruptible: true, surge: 1.1 },
  { id: "outras", nome: "Outras cargas", power: 2.2, start: 7, end: 21, priority: 5, critical: false, interruptible: true, surge: 1.0 }
];

export const DEFAULTS = {
  duration: 72, scenario: "severo", cloud: 78, wind: 70, rain: 160, roadsClose: 5, flightWindow: 34, panelDamage: 35,
  solarKw: 28, solarEfficiency: 82, solarLoss: 14,
  batteryKwh: 140, initialSoc: 92, maxDod: 88, chargeEfficiency: 94, dischargeEfficiency: 92, maxChargeKw: 28, maxDischargeKw: 28, reserve: 12,
  biomassKw: 14, biomassKg: 290, specificConsumption: 1.05, biomassEfficiency: 78, biomassMin: 3, biomassAvailable: true, dailyFuelLimit: 110, wetFuel: false,
  strategy: "vida", loads: LOADS.map(x => ({...x})), people: 1240, waterLitresPerKwh: 1650,
  healthUptimeTarget: 99, commsUptimeTarget: 95, dailyWaterTargetLitres: 18600, maxCriticalBlackoutMinutes: 60
};

const daylight = h => h >= 6 && h <= 18 ? Math.sin(((h - 6) / 12) * Math.PI) : 0;
const scenarioFactor = s => ({ normal: .92, moderado: .55, severo: .27, extremo: .12, semsol: .03 }[s] ?? .27);
const active = (load, h) => load.start <= load.end ? h >= load.start && h < load.end : h >= load.start || h < load.end;

function orderLoads(loads, strategy) {
  if (strategy === "eficiencia") return [...loads].sort((a,b) => (a.power / (a.critical ? 2 : 1)) - (b.power / (b.critical ? 2 : 1)));
  if (strategy === "igual") return [...loads];
  return [...loads].sort((a,b) => a.priority - b.priority);
}

export function simulate(input, type="resiliente") {
  const p = structuredClone(input), result = [], events = [];
  const usableFloor = Math.max((1-p.maxDod/100)*p.batteryKwh, p.reserve/100*p.batteryKwh);
  let battery = p.batteryKwh*p.initialSoc/100, fuel=p.biomassKg, firstCriticalBlackout=null, totalUnserved=0, criticalUnserved=0, biomassUsed=0, curtailed=0, criticalBlackoutRun=0, maxCriticalBlackoutRun=0;
  const uptime=Object.fromEntries(p.loads.map(l=>[l.id,0])), requestedHours=Object.fromEntries(p.loads.map(l=>[l.id,0]));
  for(let t=0;t<p.duration;t++){
    const h=t%24, storm=t>=2, damaged=storm?p.panelDamage/100:0;
    const cloudFactor=storm?(1-p.cloud/100):.9;
    const solar=p.solarKw*daylight(h)*scenarioFactor(p.scenario)*cloudFactor*(p.solarEfficiency/100)*(1-p.solarLoss/100)*(1-damaged);
    const demands=p.loads.map(l=>({ ...l, demand:active(l,h)?l.power*(storm?l.surge:1):0 }));
    const totalDemand=demands.reduce((s,l)=>s+l.demand,0);
    let bio=0;
    if(type==="resiliente"&&p.biomassAvailable&&fuel>0){
      const forecastRisk=battery<usableFloor+p.batteryKwh*.28||solar<totalDemand*.55;
      if(forecastRisk){ const wet=p.wetFuel?.65:1; const possible=Math.min(p.biomassKw*wet, fuel/(p.specificConsumption/Math.max(.1,p.biomassEfficiency/100)), p.dailyFuelLimit/24/Math.max(.1,p.specificConsumption)); bio=Math.max(0,possible); if(bio<p.biomassMin)bio=0; }
    }
    const generated=solar+bio; let direct=Math.min(generated,totalDemand), surplus=Math.max(0,generated-totalDemand), deficit=Math.max(0,totalDemand-generated);
    let charged=Math.min(surplus*p.chargeEfficiency/100,p.maxChargeKw,p.batteryKwh-battery); battery+=charged;curtailed+=Math.max(0,surplus-charged/(p.chargeEfficiency/100));
    const available=Math.max(0,battery-usableFloor), dischargeOut=Math.min(deficit,p.maxDischargeKw,available*p.dischargeEfficiency/100);battery-=dischargeOut/(p.dischargeEfficiency/100);
    let supply=direct+dischargeOut, served={};
    if(type==="convencional"||p.strategy==="igual"){
      const ratio=totalDemand?Math.min(1,supply/totalDemand):1;demands.forEach(l=>served[l.id]=l.demand*ratio);
    }else{ orderLoads(demands,p.strategy).forEach(l=>{served[l.id]=Math.min(l.demand,supply);supply-=served[l.id]}); }
    let unserved=0,criticalStep=0;demands.forEach(l=>{const miss=l.demand-(served[l.id]||0);unserved+=miss;if(l.critical)criticalStep+=miss;if(l.demand>0){requestedHours[l.id]++;if(miss<.01)uptime[l.id]++;}});
    if(criticalStep>.01){criticalBlackoutRun++;maxCriticalBlackoutRun=Math.max(maxCriticalBlackoutRun,criticalBlackoutRun);}else criticalBlackoutRun=0;
    if(criticalStep>.01&&firstCriticalBlackout===null){firstCriticalBlackout=t;events.push({t,label:`Primeiro blackout crítico: hora ${t}`,kind:"blackout"});}
    if(t===2)events.push({t,label:"O ciclone atingiu o sistema",kind:"storm"});if(t===p.roadsClose)events.push({t,label:"Estradas interrompidas",kind:"road"});if(t===p.flightWindow)events.push({t,label:"Janela segura para drones",kind:"drone"});if(bio>0&&!result.some(r=>r.bio>0))events.push({t,label:"Biomassa accionada",kind:"bio"});
    const used=bio*p.specificConsumption/Math.max(.1,p.biomassEfficiency/100);fuel=Math.max(0,fuel-used);biomassUsed+=used;totalUnserved+=unserved;criticalUnserved+=criticalStep;
    result.push({t,solar,bio,demand:totalDemand,discharge:dischargeOut,soc:battery/p.batteryKwh*100,unserved,criticalUnserved:criticalStep,served});
  }
  const up=id=>requestedHours[id]?uptime[id]/requestedHours[id]*100:100, waterServed=result.reduce((s,r)=>s+(r.served.agua||0),0)*p.waterLitresPerKwh;
  const waterByDay=Array.from({length:Math.ceil(p.duration/24)},(_,day)=>result.filter(r=>Math.floor(r.t/24)===day).reduce((s,r)=>s+(r.served.agua||0),0)*p.waterLitresPerKwh);
  const criticalDemand=result.reduce((s,r)=>s+p.loads.filter(l=>l.critical).reduce((x,l)=>x+(active(l,r.t%24)?l.power*(r.t>=2?l.surge:1):0),0),0);
  const isolatedScore=criticalDemand?Math.max(0,1-criticalUnserved/criticalDemand)*100:100;
  const resilience=.4*up("saude")+.25*Math.min(100,waterServed/(p.people*15*3)*100)+.2*up("comms")+.15*isolatedScore;
  const survival={health:up("saude")>=p.healthUptimeTarget,comms:up("comms")>=p.commsUptimeTarget,water:waterByDay.length>=3&&waterByDay.slice(0,3).every(v=>v>=p.dailyWaterTargetLitres),blackout:maxCriticalBlackoutRun*60<=p.maxCriticalBlackoutMinutes};
  survival.joint=survival.health&&survival.comms&&survival.water&&survival.blackout;
  return {series:result,events,summary:{firstBlackout:firstCriticalBlackout,healthUptime:up("saude"),commsUptime:up("comms"),waterLitres:waterServed,waterByDay,maxCriticalBlackoutMinutes:maxCriticalBlackoutRun*60,totalUnserved,criticalUnserved,finalSoc:battery/p.batteryKwh*100,biomassUsed,biomassRemaining:fuel,resilience,peopleProtected:Math.round(p.people*isolatedScore/100),survival}};
}

export function compare(params){return {convencional:simulate(params,"convencional"),resiliente:simulate(params,"resiliente")};}

export function validateMission(drone,community,weather,kits){
  const errors=[];if(weather.hour<weather.flightWindow)errors.push(`Janela segura abre na hora ${weather.flightWindow}`);if(weather.wind>drone.maxWind)errors.push("Vento acima do limite seguro");if(community.distance*2>drone.range)errors.push("Alcance de ida e volta insuficiente");if(drone.payload<kits.mass)errors.push("Carga útil excedida");if(kits.available<1)errors.push("Sem kits disponíveis");if(!drone.available)errors.push("Drone indisponível");return {ok:!errors.length,errors,time:drone.prep+community.distance*2/drone.speed*60,energy:kits.energy};
}
