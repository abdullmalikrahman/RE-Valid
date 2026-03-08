import paho.mqtt.client as mqtt
from app.core.config import settings


def on_connect(client, userdata, flags, rc, properties=None):
    print(f"MQTT connected with code {rc}")
    client.subscribe("station/#")


def on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode("utf-8")
    print(f"MQTT message: {topic} -> {payload}")
    # TODO: parse and store IoT data


def create_mqtt_client() -> mqtt.Client:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if settings.MQTT_USERNAME:
        client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message
    return client


def start_mqtt():
    client = create_mqtt_client()
    client.connect(settings.MQTT_BROKER, settings.MQTT_PORT, 60)
    client.loop_start()
    return client
