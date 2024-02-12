# contable
Programa que escolta missatges MQTT del estil : 

Topic  /Hit/Serveis/Contable/Conta
message : 
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

Inicialitza la botiga a memoria amb les dades de la DB i contesta amb un MQTT de l estil :

 Topic: /Hit/Serveis/Contable/Estock/159
 QoS: 0
{"Llicencia":"159","CodiArticle":"19","EstocActualitzat": 41}


