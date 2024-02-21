const mqtt = require('mqtt');
const sql = require('mssql');
require('dotenv').config();



// Configuració de la connexió a la base de dades MSSQL
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
      encrypt: false, // Per a Azure
      trustServerCertificate: true // Només per a desenvolupament
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 15000,
    },
    requestTimeout: 10000,
  };
// Configuració del client MQTT
const mqttOptions = {
  host: process.env.MQTT_HOST,
  port: process.env.MQTT_PORT,
  clientId: process.env.MQTT_CLIENT_ID
};

// Dades emmagatzemades en memòria
let estocPerLlicencia = {};

// Connexió al servidor MQTT
const client = mqtt.connect(mqttOptions);
client.once('connect', () => {
    console.log('Connectat al servidor MQTT' ,process.env.MQTT_HOST );
    const tema = '/Impresora';
    // Subscripció al topic desitjat
    client.subscribe(process.env.MQTT_CLIENT_ID + '/Conta/#', (err) => {
      if (!err) {
          console.log('Subscrit al topic: ',process.env.MQTT_CLIENT_ID + '/Conta/#');
      }
    });
    client.subscribe(process.env.MQTT_CLIENT_ID + tema, (err) => {
        if (!err) {
            console.log('Subscrit al topic: ',process.env.MQTT_CLIENT_ID + tema);
        }
    });
});

function nomTaulaServit(d){ // [Servit-24-02-10]
  const year = d.getFullYear().toString().slice(-2);
  const month = (d.getMonth() + 1).toString().padStart(2, '0'); // El mes, assegurant-se que té dos dígits.
  const day = d.getDate().toString().padStart(2, '0'); // El dia, assegurant-se que té dos dígits.

  return `Servit-${year}-${month}-${day}`;
}

function nomTaulaVenut(d){ //[V_Venut_2024-02] 
  const year = d.getFullYear().toString();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `V_Venut_${year}-${month}`;
}
function nomTaulaEncarregs(d){ //[v_encarre_2024-02]
  const year = d.getFullYear().toString();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `V_Encarre_${year}-${month}`;
}

async function initVectorLlicencia(Llicencia) {
console.log('initVectorLlicencia',Llicencia)
  await sql.connect(dbConfig);
  const avui = new Date(); // Correcció aquí
  const anyActual = avui.getFullYear();
  const mesActual = avui.getMonth(); // Mes actual (0-indexat)
  const diesDelMes = new Date(anyActual, mesActual + 1, 0).getDate(); // Correcte: obté el darrer dia del mes
  let sqlSt=""
  for (let dia = 1; dia <= diesDelMes; dia++) {
    let d = new Date(avui.getFullYear(), avui.getMonth(), dia);    
    if(sqlSt!="") sqlSt+=" union ";
    sqlSt+=`select CodiArticle as Article,sum(Quantitatservida) as s ,0 as v,0 as e from  [${nomTaulaServit(d)}] where client = ${Llicencia} and quantitatservida>0 group by codiarticle
          union
          select plu as Article ,0 as s ,sum(quantitat) as v , 0 as  e  from  [${nomTaulaVenut(d)}]  where botiga = ${Llicencia} and day(data) = ${dia}  group by plu
          union
          select Article as Article ,0 as s , 0 aS V , quantitat AS e  from  [${nomTaulaEncarregs(d)}] where botiga = ${Llicencia} and day(data) = ${dia} and estat = 0 `
  };
  sqlSt =`use Fac_Camps select Article as CodiArticle,isnull(sum(s),0) as UnitatsServides,isnull(Sum(v),0) as UnitatsVenudes, isnull(Sum(e),0) As unitatsEncarregades  from ( ` + sqlSt;
  sqlSt+=` ) t group by Article `;
  const result = await sql.query(sqlSt);
  result.recordset.forEach(row => {
    estocPerLlicencia[Llicencia][row.CodiArticle] = {
      actiu: true,
      estoc: (row.UnitatsServides-row.UnitatsVenudes-row.unitatsEncarregades),
      unitatsVenudes:  row.UnitatsVenudes,
      unitatsServides: row.UnitatsServides,
      unitatsEncarregades:  row.unitatsEncarregades,
      ultimaActualitzacio: new Date().toISOString()
    };    
  });
}


async function generaImpresionBoton1(msgJson){
  await sql.connect(dbConfig);
  let sqlSt =`SELECT Nom FROM impresorasip where mac = '${msgJson.mac}'`;
  console.log(sqlSt)
  let msg;
  const result = await sql.query(sqlSt);
  result.recordset.forEach(row => {
    msg = "Nombre impresora : " + row.Nom ;
  });
  const message = JSON.stringify({
    macAddress: msgJson.mac,
    msg: msg
  });
  console.log('Send: ', message)
  client.publish('/Hit/Serveis/Impresora', message)
}

async function generaImpresionBoton2(msgJson){
  let sqlSt =`SELECT Nom FROM impresorasip where mac = '00:11:62:0e:14:9e' `;
  let msg;
  const result = await sql.query(sqlSt);
  result.recordset.forEach(row => {
    msg = "Nombre impresora : " + row.Nom ;
  });
  const message = JSON.stringify({
    macAddress: msgJson.mac,
    msg: msg
  });
  console.log('Send: ', message)
  client.publish('/Hit/Serveis/Impresora', message)
}

async function generaImpresionBoton3(msgJson){
  let sqlSt =`SELECT Nom FROM impresorasip where mac = '00:11:62:0e:14:9e' `;
  let msg;
  const result = await sql.query(sqlSt);
  result.recordset.forEach(row => {
    msg = "Nombre impresora : " + row.Nom ;
  });
  const message = JSON.stringify({
    macAddress: msgJson.mac,
    msg: msg
  });
  console.log('Send: ', message)
  client.publish('/Hit/Serveis/Impresora', message)
}

// Manejador per a missatges rebuts
client.on('message', (topic, message) => {
  if (topic == process.env.MQTT_CLIENT_ID + '/Impresora') atiendeMensajeImpresora(message) 
  if (topic == process.env.MQTT_CLIENT_ID + '/Calcul') atendeMensajeCalculo(message) 
});

function atiendeMensajeImpresora(message) {
  //mqtt envia "macAddress:mac, msg:informe preparado"
  let msg = '';
  try {
    const msgJson = JSON.parse(message);
    console.log('Mensaje en modo JSON:', msgJson);
    switch (msgJson.msg) {
      case 'ImpresoraIpReposicion':
        generaImpresionBoton1(msgJson);
        break;
      case 'ImpresoraPremutBoto2':
        //generaImpresionBoton2(msgJson);
        break;
      case 'ImpresoraPremutBoto3':
        //generaImpresionBoton3(msgJson);
        break;
      default:
        break;
    }
    
  } catch (error) {
    console.log('Mensaje recibido como una cadena');
  }
}

function atendeMensajeCalculo(message) {
  const data = JSON.parse(message.toString());
  console.log('message', topic, data);
  // Comprobar si 'data' tiene la propiedad 'Articles' y que es un array
  if (data.Articles && Array.isArray(data.Articles)) {
    if (!estocPerLlicencia[data.Llicencia]) {
        estocPerLlicencia[data.Llicencia] = {};
        initVectorLlicencia(data.Llicencia);
    }
      data.Articles.forEach(article => {
        if (estocPerLlicencia[data.Llicencia][article.CodiArticle]) {
            estocPerLlicencia[data.Llicencia][article.CodiArticle].unitatsVenudes += article.Quantitat;
            estocPerLlicencia[data.Llicencia][article.CodiArticle].estoc =
            estocPerLlicencia[data.Llicencia][article.CodiArticle].unitatsServides -
            estocPerLlicencia[data.Llicencia][article.CodiArticle].unitatsVenudes -
            estocPerLlicencia[data.Llicencia][article.CodiArticle].unitatsEncarregades;
            estocPerLlicencia[data.Llicencia][article.CodiArticle].ultimaActualitzacio = new Date().toISOString();
            // Enviar mensaje MQTT con la actualización de la cantidad
            client.publish(process.env.MQTT_CLIENT_ID + '/Estock/' + data.Llicencia, JSON.stringify({
              Llicencia: data.Llicencia,
              CodiArticle: article.CodiArticle,
              EstocActualitzat: estocPerLlicencia[data.Llicencia][article.CodiArticle].estoc
            }));
        } else {
          client.publish(process.env.MQTT_CLIENT_ID + '/Estock/' + data.Llicencia, 'No revisamos este artículo');
        }
      });
  } else {
      console.log('El mensaje recibido no tiene la estructura esperada o la propiedad "Articles" no es un array');
  }
}

// Mantenir el programa en execució
process.stdin.resume();