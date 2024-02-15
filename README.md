# Contable
![Logo del Proyecto](Contable.png)
## Descripció
El projecte Contable és una solució programada en Node.js que interactua amb un servidor MQTT per processar transaccions d'articles especificades en missatges JSON. A més, aquest projecte interactua amb una base de dades MSSQL per sincronitzar l'estoc basant-se en les dades rebudes. L'objectiu principal és actualitzar l'estoc en memòria basant-se en transaccions i respondre amb l'estat actualitzat de l'estoc a través de missatges MQTT.

## Funcionalitats Clau
- **Escolta de Missatges MQTT:** Subscripció al topic MQTT `/Hit/Serveis/Contable/Conta` per rebre dades de transaccions.
- **Integració amb MSSQL:** Utilitza dades de la base de dades per inicialitzar l'estat de l'estoc en memòria.
- **Actualització i Resposta:** Actualitza l'estoc en memòria basant-se en els missatges rebuts i publica l'estoc actualitzat mitjançant missatges MQTT.

## Configuració
Per executar aquest projecte, és necessari configurar les següents variables d'entorn en un arxiu `.env` situat a l'arrel del directori del projecte:

```plaintext
DB_USER=<El teu usuari de la base de dades>
DB_PASSWORD=<La teva contrasenya de la base de dades>
DB_SERVER=<El teu servidor de base de dades>
DB_DATABASE=<El nom de la teva base de dades>
MQTT_HOST=<El teu servidor MQTT>
MQTT_PORT=<El teu port MQTT>
MQTT_CLIENT_ID=<El teu Client ID per MQTT>
```

## Estructura de Missatges
### Missatge d'Entrada
Missatges rebuts al topic `/Hit/Serveis/Contable/Conta` amb format JSON:

```json
{
  "Llicencia": "159",
  "dB": "Fac_Camps",
  "Articles": [
    {
      "CodiArticle": "355",
      "Quantitat": 1
    },
    {
      "CodiArticle": "19",
      "Quantitat": 1
    }
  ]
}
```

### Missatge de Sortida
Missatges publicats al topic `/Hit/Serveis/Contable/Estock/159` com a resposta:

```json
{"Llicencia":"159","CodiArticle":"19","EstocActualitzat": 41}
```

## Instal·lació
Per començar, segueix aquests passos:

1. **Instal·lar Dependències:** Executa `npm install` per instal·lar les dependències necessàries.
2. **Configura les Variables d'Entorn:** Omple l'arxiu `.env` amb les teves configuracions personals.
3. **Executar l'Aplicació:** Usa `node index.js` per iniciar l'aplicació.

## Dependències
- `mqtt`: Per a la gestió de la connexió i comunicació amb el servidor MQTT.
- `mssql`: Per a la connexió i operacions amb la base de dades MSSQL.
- `dotenv`: Per a la càrrega de les variables d'entorn des de l'arxiu `.env`.

## Llicència
Aquest projecte està sota una llicència que permet el seu ús, distribució, i modificació dins dels termes especificats. (Especifica la llicència si escau)

```

Aquest `README.md` proporciona una visió general del projecte, com configurar-lo, executar-lo, i una descripció detallada de la seva funcionalitat. Modifica qualsevol secció segons les necessitats específiques del teu projecte o entorn.
