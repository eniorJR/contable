const mqtt = require("mqtt");
const sql = require("mssql");
const moment = require("moment");
require("dotenv").config();

// Configuració de la connexió a la base de dades MSSQL
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false, // Per a Azure
    trustServerCertificate: true, // Només per a desenvolupament
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 15000,
  },
  requestTimeout: 10000,
};
sql.connect(dbConfig);

// Configuració del client MQTT
const mqttOptions = {
  host: process.env.MQTT_HOST,
  port: process.env.MQTT_PORT,
  clientId:
    process.env.NODE_ENV === "Dsv"
      ? `${process.env.MQTT_CLIENT_ID}-Dsv`
      : process.env.MQTT_CLIENT_ID,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
};

// Dades emmagatzemades en memòria
let estocPerLlicencia = {};

// MQTT
// Connexió al servidor MQTT
const client = mqtt.connect(mqttOptions);

client.on("connect", () => {
  console.log("Connectat al servidor MQTT", process.env.MQTT_HOST);
  // Subscripció al topic desitjat
  client.subscribe(process.env.MQTT_CLIENT_ID + "/Conta/#", (err) => {
    if (!err) {
      console.log(
        "Subscrit al topic: ",
        process.env.MQTT_CLIENT_ID + "/Conta/#"
      );
    } else {
      console.log("Error al subscriure al topic:", err);
    }
  });
});

// Manejador per a missatges rebuts
client.on("message", (topic, message) => {
  const data = JSON.parse(message.toString());
  console.log("message", topic, data);
  revisarEstoc(data);
});

// Funcions auxiliars
function nomTaulaServit(d) {
  // [Servit-24-02-10]
  const year = d.getFullYear().toString().slice(-2);
  const month = (d.getMonth() + 1).toString().padStart(2, "0"); // El mes, assegurant-se que té dos dígits.
  const day = d.getDate().toString().padStart(2, "0"); // El dia, assegurant-se que té dos dígits.

  return `Servit-${year}-${month}-${day}`;
}

function nomTaulaVenut(d) {
  //[V_Venut_2024-02]
  const year = d.getFullYear().toString();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  return `V_Venut_${year}-${month}`;
}
function nomTaulaEncarregs(d) {
  //[v_encarre_2024-02]
  const year = d.getFullYear().toString();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  return `V_Encarre_${year}-${month}`;
}

function nomTaulaCompromiso(d) {
  //[v_encarre_2024-02]
  const year = d.getFullYear().toString();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  return `Compromiso_${year}_${month}`;
}

async function initVectorLlicencia(Llicencia, Empresa) {
  //  if (Empresa !='Fac_Camps') return;
  //  if (new Date(estocPerLlicencia[Llicencia]['LastUpdate']) > new Date().setHours(0, 0, 0, 30) && !estocPerLlicencia[Llicencia]) return;
  //  if (estocPerLlicencia[Llicencia] && estocPerLlicencia[Llicencia]['LastUpdate']) return;
  try {
    const avui = new Date(); // Correcció aquí
    if (
      estocPerLlicencia[Llicencia] &&
      estocPerLlicencia[Llicencia]["LastUpdate"] &&
      new Date(estocPerLlicencia[Llicencia]["LastUpdate"]).toDateString() ===
        avui.toDateString()
    )
      return;

    let sqlSt = "";
    let LlicenciaA = Llicencia;
    if (process.env.NODE_ENV === "Dsv") LlicenciaA = 819; // T91 per proves
    const anyActual = avui.getFullYear();
    const mesActual = avui.getMonth(); // Mes actual (0-indexat)
    const diesDelMes = new Date(anyActual, mesActual + 1, 0).getDate(); // Correcte: obté el darrer dia del mes
    const minutCalcul = avui.getHours() * 60 + Math.floor(avui.getMinutes()); // Calcula el minut actual (0-47)
    console.log("Recarreguem !!!!!!!!!!!!!!!!!!!");
    estocPerLlicencia[Llicencia] = {};
    estocPerLlicencia[Llicencia] = estocPerLlicencia[Llicencia] || {};
    estocPerLlicencia[Llicencia]["LastUpdate"] = new Date().toISOString(); // Estableix o actualitza la data d'última actualització

    if (Empresa == "Fac_Camps" || Empresa == "Fac_Tena") {
      for (let dia = 1; dia <= diesDelMes; dia++) {
        let d = new Date(avui.getFullYear(), avui.getMonth(), dia);
        if (sqlSt != "") sqlSt += " union ";
        sqlSt += `select CodiArticle as Article,sum(Quantitatservida) as s ,0 as v,0 as e from  [${nomTaulaServit(
          d
        )}] where client = ${Llicencia} and quantitatservida>0 group by codiarticle
            union
            select plu as Article ,0 as s ,sum(quantitat) as v , 0 as  e  from  [${nomTaulaVenut(
              d
            )}]  where botiga = ${Llicencia} and day(data) = ${dia}  group by plu
            union
            select Article as Article ,0 as s , 0 aS V , quantitat AS e  from  [${nomTaulaEncarregs(
              d
            )}] where botiga = ${Llicencia} and day(data) = ${dia} and estat = 0 `;
      }
      sqlSt =
        `use ${Empresa} select Article as CodiArticle,isnull(sum(s),0) as UnitatsServides,isnull(Sum(v),0) as UnitatsVenudes, isnull(Sum(e),0) As unitatsEncarregades  from ( ` +
        sqlSt;
      sqlSt += ` ) t group by Article `;
      //console.log(sqlSt);
      sql.connect(dbConfig); // Assegura't que això es tracta com una promesa.
      result = await sql.query(sqlSt);
      result.recordset.forEach((row) => {
        estocPerLlicencia[Llicencia][row.CodiArticle] = {
          actiu: true,
          articleCodi: row.CodiArticle,
          ultimMissatge: "",
          estoc:
            row.UnitatsServides - row.UnitatsVenudes - row.unitatsEncarregades,
          tipus: "Encarrecs",
          unitatsVenudes: row.UnitatsVenudes,
          unitatsServides: row.UnitatsServides,
          unitatsEncarregades: row.unitatsEncarregades,
          ultimaActualitzacio: new Date().toISOString(),
        };
      });
    }
    const lastWeekSameDay = moment().subtract(7, "days").format("YYYY-MM-DD"); // Mateix dia de la setmana, setmana passada
    let lastWeekSameDayDia = moment().subtract(7, "days").date();
    let historicArrayNew = [];
    let objectiuNew = 0;
    let unitatsVenudesNew = 0;
    let unitatsVenudes7dNew = 0;

    sqlSt = `use ${Empresa} SELECT 
         plu as CodiArticle,
         objectiu as Objectiu,
         Min*30 as Minut,
         SUM(CASE WHEN T = 'Avui' THEN quantitat ELSE 0 END) AS SumaAvui,
         SUM(CASE WHEN T = 'Past' THEN quantitat ELSE 0 END) AS SumaPast
         FROM 
         (
         -- Subconsulta per les dades "Avui"
         SELECT 
             'Avui' AS T,
             v.plu,
             objectiu,
             (DATEDIFF(MINUTE, CAST(v.data AS DATE), v.data) / 30) AS Min,
             SUM(v.quantitat) AS quantitat
         FROM 
             (SELECT comentaris AS plu, objectiu 
             FROM [${nomTaulaCompromiso(avui)}] 
             WHERE dia = '${moment(avui).format(
               "YYYY-MM-DD"
             )}' AND botiga =  ${Llicencia}) o
         JOIN 
         [${nomTaulaVenut(
           avui
         )}] v ON v.plu = o.plu AND v.Botiga =  ${LlicenciaA} AND DAY(v.data) = ${moment().date()}
         GROUP BY 
             (DATEDIFF(MINUTE, CAST(v.data AS DATE), v.data) / 30),
             objectiu,
             v.plu
          UNION ALL
          -- Subconsulta per les dades "Passat"
         SELECT 
             'Past' AS T,
             v.plu,
             objectiu,
             (DATEDIFF(MINUTE, CAST(v.data AS DATE), v.data) / 30) AS Min,
             SUM(v.quantitat) AS quantitat
         FROM 
             (SELECT comentaris AS plu, objectiu 
             FROM [${nomTaulaCompromiso(avui)}] 
             WHERE dia = '${moment(avui).format(
               "YYYY-MM-DD"
             )}' AND botiga =  ${Llicencia}) o
         JOIN 
         [${nomTaulaVenut(
           new Date(lastWeekSameDay)
         )}] v ON v.plu = o.plu AND v.Botiga =  ${LlicenciaA}  AND DAY(v.data) = ${lastWeekSameDayDia} 
         GROUP BY 
             (DATEDIFF(MINUTE, CAST(v.data AS DATE), v.data) / 30),
             objectiu,
             v.plu
         ) a 
         GROUP BY 
         plu,
         objectiu,
         Min 
         ORDER BY 
         plu,
         objectiu,
        Min;`;
    //console.log(sqlSt);
    result2 = await sql.query(sqlSt);
    result2.recordset.forEach((row) => {
      historicArrayNew = [];
      unitatsVenudesNew = row.SumaAvui;
      unitatsVenudes7dNew = row.Minut < minutCalcul ? row.SumaPast : 0;
      objectiuNew = unitatsVenudes7dNew * (1 + parseFloat(row.Objectiu) / 100);

      if (estocPerLlicencia[Llicencia][row.CodiArticle]) {
        historicArrayNew =
          estocPerLlicencia[Llicencia][row.CodiArticle].historic;
        unitatsVenudesNew =
          estocPerLlicencia[Llicencia][row.CodiArticle].unitatsVenudes +
          unitatsVenudesNew;
        unitatsVenudes7dNew =
          estocPerLlicencia[Llicencia][row.CodiArticle].unitatsVenudes7d +
          unitatsVenudes7dNew;
        objectiuNew =
          estocPerLlicencia[Llicencia][row.CodiArticle].objectiu + objectiuNew;
      }

      estocPerLlicencia[Llicencia][row.CodiArticle] = {
        actiu: true,
        tipus: "Compromisos",
        articleCodi: row.CodiArticle,
        ultimMissatge: "",
        historic: historicArrayNew.concat({
          Minut: row.Minut,
          objectiu: row.Objectiu,
          SumaAvui: row.SumaAvui,
          SumaPast: row.SumaPast,
        }),
        unitatsVenudes: unitatsVenudesNew,
        unitatsVenudes7d: unitatsVenudes7dNew,
        objectiu: objectiuNew,
        minutCalcul: minutCalcul,
      };
    });

    sqlSt = `use ${Empresa} 
         IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'IndicadorsBotiga')
         BEGIN
           CREATE TABLE IndicadorsBotiga (
           ID uniqueidentifier DEFAULT newid() PRIMARY KEY,
           TmSt datetime DEFAULT getdate(),
           Botiga nvarchar(255),
           Tipus nvarchar(255),
           Actiu nvarchar(255),
           Param1 nvarchar(255),
           Param2 nvarchar(255),
           Param3 nvarchar(255),
           Param4 nvarchar(255),
           Param5 nvarchar(255)
         );
         END;
         if (Select count(*) from IndicadorsBotiga Where Botiga = ${Llicencia} and Actiu = '1' and Tipus = 'IndicadorVenut') > 0
         begin
         select 
               Min*30 as Minut,
               SUM(CASE WHEN T = 'Avui' THEN import ELSE 0 END) AS SumaAvui,
               SUM(CASE WHEN T = 'Past' THEN import ELSE 0 END) AS SumaPast
               FROM 
               (
               -- Subconsulta per les dades "Avui"
               SELECT 
                   'Avui' AS T,
                   (DATEDIFF(MINUTE, CAST(v.data AS DATE), v.data) / 30) AS Min,
                   SUM(v.import) AS import
               FROM 
               [${nomTaulaVenut(
                 avui
               )}] v where v.Botiga =  ${LlicenciaA} AND DAY(v.data) = ${moment().date()}
               GROUP BY 
                   (DATEDIFF(MINUTE, CAST(v.data AS DATE), v.data) / 30)
                UNION ALL
                -- Subconsulta per les dades "Passat"
               SELECT 
                   'Past' AS T,
                   (DATEDIFF(MINUTE, CAST(v.data AS DATE), v.data) / 30) AS Min,
                   SUM(v.import) AS import
               FROM 
               [${nomTaulaVenut(
                 new Date(lastWeekSameDay)
               )}] v where v.Botiga =  ${LlicenciaA}  AND DAY(v.data) = ${lastWeekSameDayDia}
               GROUP BY 
                   (DATEDIFF(MINUTE, CAST(v.data AS DATE), v.data) / 30)
               ) a 
               GROUP BY 
               Min 
               ORDER BY 
              Min;
      end`;
    //console.log(sqlSt);
    result2 = await sql.query(sqlSt);
    if (result2 && result2.recordset) {
      result2.recordset.forEach((row) => {
        historicArrayNew = [];
        unitatsVenudesNew = row.SumaAvui;
        unitatsVenudes7dNew = row.Minut < minutCalcul ? row.SumaPast : 0;
        objectiuNew =
          unitatsVenudes7dNew * (1 + parseFloat(row.Objectiu) / 100);

        if (estocPerLlicencia[Llicencia]["IndicadorVenut"]) {
          historicArrayNew =
            estocPerLlicencia[Llicencia]["IndicadorVenut"].historic;
          unitatsVenudesNew =
            estocPerLlicencia[Llicencia]["IndicadorVenut"].unitatsVenudes +
            unitatsVenudesNew;
          unitatsVenudes7dNew =
            estocPerLlicencia[Llicencia]["IndicadorVenut"].unitatsVenudes7d +
            unitatsVenudes7dNew;
          objectiuNew =
            estocPerLlicencia[Llicencia]["IndicadorVenut"].objectiu +
            objectiuNew;
        }

        estocPerLlicencia[Llicencia]["IndicadorVenut"] = {
          actiu: true,
          tipus: "IndicadorVenut",
          articleCodi: "IndicadorVenut",
          ultimMissatge: "",
          historic: historicArrayNew.concat({
            Minut: row.Minut,
            objectiu: row.Objectiu,
            SumaAvui: row.SumaAvui,
            SumaPast: row.SumaPast,
          }),
          unitatsVenudes: unitatsVenudesNew,
          unitatsVenudes7d: unitatsVenudes7dNew,
          objectiu: objectiuNew,
          minutCalcul: minutCalcul,
        };
      });
    }
    return;
  } catch (error) {
    console.error(error);
    // Gestiona l'error o llança'l de nou si és necessari.
    throw error; // Llançar l'error farà que la promesa sigui rebutjada.
  }
}

// Quan es rep un missatge MQTT
async function revisarEstoc(data) {
  // Comprovar si 'data' té la propietat 'Articles' i que és una array
  if (data && data.Articles && Array.isArray(data.Articles)) {
    try {
      await initVectorLlicencia(data.Llicencia, data.Empresa);
      const minutCalcul =
        new Date().getHours() * 60 + Math.floor(new Date().getMinutes()); // Calcula el minut actual (0-47)

      data.Articles.forEach((article) => {
        const articleData =
          estocPerLlicencia[data.Llicencia][article.CodiArticle];
        if (articleData) {
          // Update the units sold and handle floating-point arithmetic correctly
          const quantitat = parseFloat(article.Quantitat);
          const unitatsVenudes = parseFloat(articleData.unitatsVenudes);
          articleData.unitatsVenudes = (quantitat + unitatsVenudes).toFixed(3);

          if (articleData.tipus === "Encarrecs") {
            articleData.estoc =
              articleData.unitatsServides -
              articleData.unitatsVenudes -
              articleData.unitatsEncarregades;
            articleData.ultimaActualitzacio = new Date().toISOString();

            client.publish(
              `${process.env.MQTT_CLIENT_ID}/Estock/${data.Llicencia}`,
              JSON.stringify({
                Llicencia: data.Llicencia,
                CodiArticle: article.CodiArticle,
                EstocActualitzat: articleData.estoc,
                FontSize: 12,
                FontColor: "Black",
              })
            );
          }
        }
      });

      // The following part assumes estocPerLlicencia[data.Llicencia] is an array, which might not be the case
      Object.values(estocPerLlicencia[data.Llicencia]).forEach((controlat) => {
        if (controlat.tipus === "Compromisos") {
          // Actualitzem compromis
          controlat.historic.forEach((historic) => {
            // caldria afinar al minut !!!
            if (
              historic.Minut > controlat.minutCalcul &&
              minutCalcul > controlat.minutCalcul
            ) {
              controlat.unitatsVenudes7d =
                controlat.unitatsVenudes7d + parseFloat(historic.SumaPast);
              controlat.minutCalcul = historic.Minut;
            }
          });

          let missatge = ""; // Creem el missatge
          if (
            parseFloat(controlat.unitatsVenudes) <
            parseFloat(controlat.objectiu)
          )
            missatge =
              parseFloat(controlat.unitatsVenudes) >
              parseFloat(controlat.objectiu)
                ? "😄"
                : "💩";
          let dif = Math.floor(controlat.unitatsVenudes - controlat.objectiu);

          /*            let carasInc=['🤑','😃','😄','😒','😥','😳','😟','💩','😠','😡','🤬','🤢'];
                      if (dif >= 2) missatge = carasInc[0]; // Molt bé, supera l'objectiu per 2 o més unitats
                       else if (dif === 1) missatge = carasInc[1]; // Bé, supera l'objectiu per 1 unitat
                        else if (dif === 0) missatge = carasInc[2]; 
                         else if (dif === -1) missatge = carasInc[3]; 
                          else if (dif === -2) missatge = carasInc[4]; 
                           else if (dif === -3) missatge = carasInc[5]; 
                            else if (dif === -4) missatge = carasInc[6]; 
                             else if (dif === -5) missatge = carasInc[7]; 
                              else if (dif === -6) missatge = carasInc[8]; 
                               else if (dif === -7) missatge = carasInc[9]; 
                                else if (dif === -8) missatge = carasInc[10]; 
                                 else if (dif === -9) missatge = carasInc[11]; 
          */
          let carasInc = ["", "😃", "🍒", "🤢"];
          console.log(dif);
          if (dif >= 2) missatge = carasInc[0];
          // Molt bé, supera l'objectiu per 2 o més unitats
          else if (dif === 1)
            missatge = carasInc[1]; // Bé, supera l'objectiu per 1 unitat
          else if (dif === 0) missatge = carasInc[1];
          else if (dif === -1) missatge = carasInc[2];
          else if (dif === -2) missatge = carasInc[2] + carasInc[2];
          else if (dif === -3)
            missatge = carasInc[2] + carasInc[2] + carasInc[2];
          else if (dif === -4)
            missatge = carasInc[2] + carasInc[2] + carasInc[2] + carasInc[2];
          else if (dif === -5)
            missatge =
              carasInc[2] +
              carasInc[2] +
              carasInc[2] +
              carasInc[2] +
              carasInc[2];
          else if (dif === -6)
            missatge =
              carasInc[2] +
              carasInc[2] +
              carasInc[2] +
              carasInc[2] +
              carasInc[2] +
              carasInc[2];
          else if (dif <= -6) missatge = carasInc[3];
          else if (dif >= 1) missatge = "";

          if (controlat.ultimMissatge !== missatge) {
            controlat.ultimMissatge = missatge;
            client.publish(
              `${process.env.MQTT_CLIENT_ID}/Estock/${data.Llicencia}`,
              JSON.stringify({
                Llicencia: data.Llicencia,
                CodiArticle: controlat.articleCodi,
                EstocActualitzat: controlat.ultimMissatge,
                FontSize: 20,
                FontColor: "Black",
              })
            );
          }
        } else if (controlat.tipus === "IndicadorVenut") {
          controlat.historic.forEach((historic) => {
            // caldria afinar al minut !!!
            if (
              historic.Minut > controlat.minutCalcul &&
              minutCalcul > controlat.minutCalcul
            ) {
              controlat.unitatsVenudes7d =
                controlat.unitatsVenudes7d + parseFloat(historic.SumaPast);
              controlat.minutCalcul = historic.Minut;
            }
          });

          let missatge = ""; // Creem el missatge
          if (
            parseFloat(controlat.unitatsVenudes) <
            parseFloat(controlat.unitatsVenudes7d)
          )
            missatge =
              parseFloat(controlat.unitatsVenudes) >
              parseFloat(controlat.unitatsVenudes7d)
                ? "😄"
                : "💩";
          let dif = Math.floor(
            controlat.unitatsVenudes - controlat.unitatsVenudes7d
          );

          let carasInc = [
            "🤑",
            "😃",
            "😄",
            "😒",
            "😥",
            "😳",
            "😟",
            "💩",
            "😠",
            "😡",
            "🤬",
            "🤢",
          ];
          if (dif >= 2) missatge = carasInc[0];
          // Molt bé, supera l'objectiu per 2 o més unitats
          else if (dif === 1)
            missatge = carasInc[1]; // Bé, supera l'objectiu per 1 unitat
          else if (dif === 0) missatge = carasInc[2];
          else if (dif === -1) missatge = carasInc[3];
          else if (dif === -2) missatge = carasInc[4];
          else if (dif === -3) missatge = carasInc[5];
          else if (dif === -4) missatge = carasInc[6];
          else if (dif === -5) missatge = carasInc[7];
          else if (dif === -6) missatge = carasInc[8];
          else if (dif === -7) missatge = carasInc[9];
          else if (dif === -8) missatge = carasInc[10];
          else if (dif === -9) missatge = carasInc[11];

          if (controlat.ultimMissatge !== missatge) {
            controlat.ultimMissatge = missatge;
            client.publish(
              `${process.env.MQTT_CLIENT_ID}/Estock/${data.Llicencia}`,
              JSON.stringify({
                Llicencia: data.Llicencia,
                CodiArticle: "IndicadorPos1",
                EstocActualitzat: controlat.ultimMissatge,
                FontSize: 20,
                FontColor: "Black",
              })
            );
          }
        }
      });
    } catch (error) {
      console.error("Error handling stock: ", error);
    }
  }
}

// Mantenir el programa en execució
process.stdin.resume();
