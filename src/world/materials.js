/* The material table. LANE A (world).

   One byte per landscape pixel indexes this table. Properties follow the
   Clonk material model:

     density      <25 free, 25..49 liquid, >=50 solid
     friction     0-100, grip while walking on it
     digFree      0/1, whether a shovel gets through it
     dig2         item id produced by digging it (see items/itemdefs.js)
     dig2ratio    how much material is needed per item (bigger = rarer)
     instable     0/1, collapses when undermined
     maxSlide     how far it creeps sideways down a slope
     maxAirSpeed  terminal speed of a loose pixel of this material
     light        >0: emits light underground (lava, uranium)
     col/grain/patch/fleck  how it is painted

   Adding a material: append at the END so existing indices never shift. */

export const M_SKY      = 0;
export const M_TUNNEL   = 1;
export const M_EARTH    = 2;
export const M_SAND     = 3;
export const M_GRANITE  = 4;
export const M_ROCK     = 5;
export const M_CLAY     = 6;
export const M_LIMEST   = 7;
export const M_GRAVEL   = 8;
export const M_COAL     = 9;
export const M_IRON     = 10;
export const M_COPPER   = 11;
export const M_TIN      = 12;
export const M_ZINC     = 13;
export const M_LEAD     = 14;
export const M_NICKEL   = 15;
export const M_BAUXITE  = 16;
export const M_QUARTZ   = 17;
export const M_TITAN    = 18;
export const M_SILVER   = 19;
export const M_GOLD     = 20;
export const M_URANIUM  = 21;
export const M_RAREEART = 22;
export const M_WATER    = 23;
export const M_LAVA     = 24;
export const M_OIL      = 25;

const stone = { density:50, friction:78, digFree:1, blastFree:1, instable:0, maxSlide:0, maxAirSpeed:30, shape:2 };

export const MATS = [
 { name:"Sky", density:0, friction:0, digFree:0, blastFree:0, instable:0, maxSlide:0, maxAirSpeed:0,
   col:[0,0,0], grain:0, patch:0, seed:1 },

 { name:"Tunnel", density:0, friction:0, digFree:0, blastFree:0, instable:0, maxSlide:0, maxAirSpeed:0,
   col:[41,31,24], grain:11, patch:17, seed:2 },

 { name:"Earth", density:50, friction:65, digFree:1, blastFree:1, instable:0, maxSlide:0, maxAirSpeed:35,
   soil:1, dig2:"soil", dig2ratio:500, shape:2,
   col:[108,74,44], grain:26, patch:30, seed:3, fleck:[86,58,34], fleckChance:0.16 },

 { name:"Sand", density:50, friction:35, digFree:1, blastFree:1, instable:1, maxSlide:6, maxAirSpeed:45,
   dig2:"sand", dig2ratio:340, shape:1,
   col:[196,168,106], grain:30, patch:22, seed:4, fleck:[214,190,132], fleckChance:0.22 },

 { name:"Granite", density:50, friction:100, digFree:0, blastFree:0, instable:0, maxSlide:0, maxAirSpeed:0,
   dig2:null, dig2ratio:0, shape:3,
   col:[104,100,96], grain:34, patch:26, seed:5, fleck:[136,132,126], fleckChance:0.14 },

 { name:"Rock", ...stone, digFree:1, friction:80, dig2:"rock", dig2ratio:420, shape:3,
   col:[118,102,84], grain:30, patch:26, seed:6, fleck:[144,126,104], fleckChance:0.16 },

 { name:"Clay", density:50, friction:60, digFree:1, blastFree:1, instable:0, maxSlide:0, maxAirSpeed:35,
   dig2:"clay", dig2ratio:300, shape:1,
   col:[146,86,58], grain:20, patch:26, seed:12, fleck:[168,104,70], fleckChance:0.18 },

 { name:"Limestone", ...stone, dig2:"limestone", dig2ratio:360,
   col:[176,168,142], grain:24, patch:24, seed:13, fleck:[200,192,166], fleckChance:0.18 },

 { name:"Gravel", density:50, friction:45, digFree:1, blastFree:1, instable:1, maxSlide:4, maxAirSpeed:40,
   dig2:"gravel", dig2ratio:380, shape:1,
   col:[128,120,112], grain:40, patch:20, seed:14, fleck:[92,86,80], fleckChance:0.30 },

 { name:"Coal", ...stone, friction:70, dig2:"coal", dig2ratio:260, inflammable:1,
   col:[42,40,39], grain:26, patch:18, seed:7, fleck:[74,72,70], fleckChance:0.20 },

 { name:"Iron ore", ...stone, dig2:"iron_ore", dig2ratio:300,
   col:[112,80,58], grain:24, patch:22, seed:8, fleck:[186,92,52], fleckChance:0.32 },

 { name:"Copper ore", ...stone, dig2:"copper_ore", dig2ratio:300,
   col:[104,96,80], grain:24, patch:22, seed:15, fleck:[62,178,140], fleckChance:0.30 },

 { name:"Tin ore", ...stone, dig2:"tin_ore", dig2ratio:320,
   col:[110,106,102], grain:24, patch:22, seed:16, fleck:[206,214,222], fleckChance:0.26 },

 { name:"Zinc ore", ...stone, dig2:"zinc_ore", dig2ratio:320,
   col:[104,110,116], grain:24, patch:22, seed:17, fleck:[150,176,196], fleckChance:0.26 },

 { name:"Lead ore", ...stone, dig2:"lead_ore", dig2ratio:340,
   col:[86,88,96], grain:22, patch:20, seed:18, fleck:[118,126,142], fleckChance:0.28 },

 { name:"Nickel ore", ...stone, dig2:"nickel_ore", dig2ratio:340,
   col:[104,110,98], grain:24, patch:22, seed:19, fleck:[176,206,176], fleckChance:0.28 },

 { name:"Bauxite", ...stone, friction:72, dig2:"bauxite", dig2ratio:320,
   col:[142,102,78], grain:26, patch:24, seed:20, fleck:[206,150,116], fleckChance:0.30 },

 { name:"Quartz", ...stone, friction:84, dig2:"quartz", dig2ratio:300,
   col:[150,148,146], grain:26, patch:22, seed:21, fleck:[236,240,246], fleckChance:0.34 },

 { name:"Titanium ore", ...stone, friction:86, dig2:"titanium_ore", dig2ratio:380,
   col:[100,94,112], grain:24, patch:22, seed:22, fleck:[164,150,200], fleckChance:0.30 },

 { name:"Silver ore", ...stone, dig2:"silver_ore", dig2ratio:340,
   col:[112,114,118], grain:22, patch:20, seed:23, fleck:[226,232,238], fleckChance:0.30 },

 { name:"Gold ore", ...stone, dig2:"gold_ore", dig2ratio:360,
   col:[118,96,58], grain:22, patch:20, seed:9, fleck:[238,196,72], fleckChance:0.34 },

 { name:"Uranium ore", ...stone, friction:82, dig2:"uranium_ore", dig2ratio:420, light:0.5,
   col:[78,92,70], grain:22, patch:20, seed:24, fleck:[142,224,74], fleckChance:0.26 },

 { name:"Rare earth", ...stone, friction:82, dig2:"rare_earth", dig2ratio:440,
   col:[104,86,104], grain:24, patch:22, seed:25, fleck:[200,106,208], fleckChance:0.28 },

 { name:"Water", density:25, friction:10, digFree:0, blastFree:1, instable:0, maxSlide:0, maxAirSpeed:60,
   liquid:1, extinguisher:1,
   col:[46,96,168], grain:16, patch:22, seed:10 },

 { name:"Lava", density:25, friction:10, digFree:0, blastFree:1, instable:0, maxSlide:0, maxAirSpeed:20,
   liquid:1, incendiary:1, light:1.0,
   col:[196,72,20], grain:40, patch:48, seed:11, fleck:[255,196,72], fleckChance:0.10 },

 { name:"Oil", density:25, friction:12, digFree:0, blastFree:1, instable:0, maxSlide:0, maxAirSpeed:40,
   liquid:1, inflammable:1,
   col:[34,28,26], grain:14, patch:18, seed:26 }
];

for(let i=0;i<MATS.length;i++){
  const m = MATS[i];
  m.index = i;
  m.solid = m.density>=50;
  m.isLiq = m.density>=25 && m.density<50;
  m.free  = m.density<25;
  if(m.grain===undefined) m.grain = 0;
  if(m.patch===undefined) m.patch = 0;
  if(m.light===undefined) m.light = 0;
}

/* every material that yields something when dug, for UI and tests */
export const ORE_MATERIALS = MATS.filter(m => m.dig2);

export function matByName(name){
  return MATS.find(m => m.name.toLowerCase() === name.toLowerCase());
}
