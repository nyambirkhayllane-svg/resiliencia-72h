export const LOADS=[
 {id:"comms",name:"Radio/VHF, LEDs, telemoveis e controlo",priority:1,dailyKwh:.55},
 {id:"cold",name:"Frigorifico de medicamentos",priority:1,dailyKwh:.9},
 {id:"pump",name:"Bomba DC para deposito elevado",priority:1,dailyKwh:.5,schedule:[6,8]},
 {id:"secondary",name:"Iluminacao adicional e carregamentos",priority:2,dailyKwh:.3,schedule:[18,24]}
];
export const DEFAULTS={duration:72,timeStepHours:.25,solarKwp:2,batteryKwh:10,initialSoc:100,usableBatteryPercent:80,deliveryEfficiency:90,chargeEfficiency:94,panelDamage:0,cloud:100,inverterKw:2,waterPeakM:3.4,floodPeakHour:30,fixedCabinetM:1.2,guideHeightM:4.5,moduleMassKg:360,moduleCgHeightM:.65,drumCount:4,drumLitres:200,drumDiameterM:.58,drumLengthM:.9,requiredDisplacementLitresPerKg:2,cableTravelM:3.1,debrisRisk:15,guideFailure:false,sensorFailure:false,controllerFailure:false,leakage:false,portablePackKwh:.65,portablePackMaxKw:.12,loadMultiplier:1,batteryDegradation:0,tankCapacityLitres:1000,initialTankLitres:1000,waterUseLitresDay:300,pumpLitresPerKwh:2000,thermalStorageHours:8};
const daylight=h=>h>=6&&h<=18?Math.sin((h-6)/12*Math.PI):0;
const active=(load,h)=>!load.schedule||(h>=load.schedule[0]&&h<load.schedule[1]);
export function floodLevel(t,p){const peak=Math.max(.25,Math.min(p.duration-.25,p.floodPeakHour));return t<=peak?p.waterPeakM*(t/peak)**1.45:p.waterPeakM*Math.max(0,1-(t-peak)/(p.duration-peak))**1.2}
export function simulate(input={}){
 const p={...DEFAULTS,...structuredClone(input)},dt=p.timeStepHours,steps=Math.round(p.duration/dt),series=[],events=[];
 const usableFraction=Math.max(0,p.usableBatteryPercent/100-p.batteryDegradation/100),floor=p.batteryKwh*(1-usableFraction),eff=p.deliveryEfficiency/100,totalBuoyancyLitres=p.drumCount*p.drumLitres,displacementRatio=p.moduleMassKg?totalBuoyancyLitres/p.moduleMassKg:Infinity;
 const displacedLitres=Math.min(totalBuoyancyLitres,p.moduleMassKg),waterplaneArea=Math.max(.01,p.drumCount*p.drumDiameterM*p.drumLengthM),draftM=displacedLitres/1000/waterplaneArea,freeboardM=Math.max(0,p.drumDiameterM-draftM),buoyancyReserveKg=Math.max(0,totalBuoyancyLitres-p.moduleMassKg);
 const lateralCapacityN=Math.max(0,buoyancyReserveKg*9.81*Math.max(.05,freeboardM)/(p.moduleCgHeightM+.1)),stableBase=displacementRatio>=p.requiredDisplacementLitresPerKg&&p.moduleCgHeightM<1&&lateralCapacityN>=250;
 let battery=p.batteryKwh*p.initialSoc/100,pack=p.portablePackKwh,tank=Math.min(p.tankCapacityLitres,p.initialTankLitres),thermal=p.thermalStorageHours,isolated=false,firstP1Failure=null,previousFloat=false,previousIsolation=false,previousFallback=false;
 const uptime={comms:0,cold:0,pump:0},requested={comms:0,cold:0,pump:0};
 for(let i=0;i<steps;i++){
  const t=i*dt,h=t%24,water=floodLevel(t,p),floats=water>p.fixedCabinetM,moduleY=floats?Math.min(water-draftM,p.guideHeightM):p.fixedCabinetM,travel=Math.max(0,moduleY-p.fixedCabinetM),guideBlocked=p.guideFailure||(p.debrisRisk>75&&floats),stable=stableBase&&!guideBlocked;
  const cableExceeded=travel>p.cableTravelM+1e-9,guideExceeded=water>p.guideHeightM+draftM,leakTrip=p.leakage&&water>.15,unsafe=floats&&(!stable||cableExceeded||guideExceeded),manualFallback=p.sensorFailure||p.controllerFailure;
  isolated=isolated||unsafe||leakTrip;
  if(floats&&!previousFloat)events.push({t,label:"Modulo inicia flutuacao controlada",kind:"float"});
  if(manualFallback&&!previousFallback)events.push({t,label:"Falha de controlo: P2 cortada; P1 em modo manual",kind:"fallback"});
  if(isolated&&!previousIsolation)events.push({t,label:"Isolamento eletrico antes do limite mecanico",kind:"isolate"});
  previousFloat=floats;previousIsolation=isolated;previousFallback=manualFallback;
  const solarPotential=p.solarKwp*daylight(h)*(1-p.cloud/100)*(1-p.panelDamage/100)*.82,solar=isolated?0:solarPotential;
  const coldCycle=((t%2)<.75),coldFactor=thermal>0?.35:(coldCycle?1.45:.55);if(thermal>0)thermal=Math.max(0,thermal-dt);
  const desired=LOADS.map(l=>({...l,demand:active(l,h)?l.dailyKwh/(l.schedule?(l.schedule[1]-l.schedule[0]):24)*p.loadMultiplier*(l.id==="cold"?coldFactor:1):0}));
  const soc=battery/p.batteryKwh,mode=manualFallback?"manual_p1":soc>=.5?"normal":soc>=.3?"racionamento":"sobrevivencia",allowed=desired.filter(l=>l.priority===1||(mode==="normal"&&!manualFallback));let served={comms:0,cold:0,pump:0,secondary:0},direct=0,batteryOut=0,charge=0;
  if(isolated){const emergencyDemand=Math.min(p.portablePackMaxKw,desired.find(l=>l.id==="comms").demand+.02),packOut=Math.min(emergencyDemand,pack/dt);served.comms=Math.min(desired.find(l=>l.id==="comms").demand,packOut);served.emergencyLight=Math.max(0,packOut-served.comms);pack=Math.max(0,pack-packOut*dt);}
  else{const demand=allowed.reduce((s,l)=>s+l.demand,0);direct=Math.min(demand,solar);const remaining=demand-direct,deliverable=Math.max(0,battery-floor)*eff/dt;batteryOut=Math.min(remaining,p.inverterKw,deliverable);battery=Math.max(floor,battery-batteryOut*dt/eff);let supply=direct+batteryOut;allowed.forEach(l=>{served[l.id]=Math.min(l.demand,supply);supply-=served[l.id]});const surplus=Math.max(0,solar-direct);charge=Math.min(surplus,p.inverterKw,(p.batteryKwh-battery)/dt)*dt*p.chargeEfficiency/100;battery=Math.min(p.batteryKwh,battery+charge);}
  const pumpEnergy=served.pump*dt,tankAdded=pumpEnergy*p.pumpLitresPerKwh,tankUse=p.waterUseLitresDay/24*dt;tank=Math.max(0,Math.min(p.tankCapacityLitres,tank+tankAdded)-tankUse);
  for(const id of Object.keys(requested)){const l=desired.find(x=>x.id===id);if(l.demand>0){requested[id]++;if(served[id]+1e-7>=l.demand)uptime[id]++;}}
  const p1Demand=desired.filter(l=>l.priority===1).reduce((s,l)=>s+l.demand,0),p1Served=desired.filter(l=>l.priority===1).reduce((s,l)=>s+served[l.id],0);if(firstP1Failure===null&&p1Served+1e-7<p1Demand)firstP1Failure=t;
  const energyInput=direct+batteryOut+(isolated?(served.comms+(served.emergencyLight||0)):0),energyAllocated=Object.values(served).reduce((s,v)=>s+v,0);
  series.push({t,water,moduleY,draftM,freeboardM,lateralCapacityN,floats,stable,guideBlocked,cableExceeded,guideExceeded,manualFallback,isolated,solar,solarPotential,demand:desired.reduce((s,l)=>s+l.demand,0),p1Demand,p1Served,batteryKwh:battery,batteryOut,charge,soc:battery/p.batteryKwh*100,packKwh:pack,tankLitres:tank,thermalHours:thermal,mode,served,energyInput,energyAllocated});
 }
 const serviceUptime=Object.fromEntries(Object.keys(uptime).map(id=>[id,requested[id]?uptime[id]/requested[id]*100:100])),p1Success=Object.values(serviceUptime).every(v=>v>=99.99);
 return {series,events,summary:{p1Success,serviceUptime,firstP1Failure,finalSoc:series.at(-1).soc,isolated:series.some(r=>r.isolated),manualFallback:series.some(r=>r.manualFallback),maxWater:Math.max(...series.map(r=>r.water)),displacementRatio,draftM,freeboardM,lateralCapacityN,buoyancyPass:stableBase,finalTankLitres:tank,energyBudgetKwh:LOADS.reduce((s,l)=>s+l.dailyKwh,0)*3,guaranteedBatteryKwh:p.batteryKwh*usableFraction*eff}};
}
export function seeded(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
export function monteCarlo(base,n=500,seed=72026){const rnd=seeded(seed),records=[];for(let i=0;i<n;i++){const sample={cloud:70+rnd()*30,panelDamage:rnd()*45,waterPeakM:2+rnd()*4,floodPeakHour:18+rnd()*24,debrisRisk:rnd()*100,batteryDegradation:rnd()*20,loadMultiplier:.9+rnd()*.35,guideFailure:rnd()<.06,sensorFailure:rnd()<.03,controllerFailure:rnd()<.03,leakage:rnd()<.025};const p={...base,...sample};records.push({sample,result:simulate(p)})}return records}
