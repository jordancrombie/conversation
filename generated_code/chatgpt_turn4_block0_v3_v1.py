# chatgpt_turn4_block0_v3.py

import time

class AdvancedCommunicationProtocol:
    MAX_RETRIES = 3  # Maximum number of retries
    INITIAL_DELAY = 1  # Initial delay in seconds
    BACKOFF_MULTIPLIER = 2  # Factor by which the delay increases each time

    def send_packet(self, packet: dict, destination: str, retries=0):
        """
        Sends a packet to a destination, retrying up to MAX_RETRIES times if an error occurs.
        """
        delay = self.INITIAL_DELAY * (self.BACKOFF_MULTIPLIER ** retries)
        print(f"Error occurred while sending packet, retrying in {delay} seconds ({retries + 1}/{self.MAX_RETRIES})...")
        time.sleep(delay)  # Wait before retrying
        if packet.get("error_code") is not None and retries < self.MAX_RETRIES:
            self.send_packet(packet, destination, retries + 1)

    def receive_packet(self, packet: dict, retries=0) -> dict:
        """
        Receives a packet and performs basic validation, retrying up to MAX_RETRIES times if an error occurs.
        """
        delay = self.INITIAL_DELAY * (self.BACKOFF_MULTIPLIER ** retries)
        print(f"Error occurred while receiving packet, retrying in {delay} seconds ({retries + 1}/{self.MAX_RETRIES})...")
        time.sleep(delay)  # Wait before retrying
        if packet.get("error_code") is not None and retries < self.MAX_RETRIES:
            self.receive_packet(packet, retries + 1)


def run():
    protocol = AdvancedCommunicationProtocol()
    destination = "192.168.1.100"  # Example destination

    # Simulate sending and receiving packets with potential errors
    for i in range(5):
        packet = {"type": "data", "data": f"Message {i}"}
        try:
            response = protocol.receive_packet(packet)
            print(f"Received: {response}")
        except Exception as e:
            print(f"Error receiving packet: {e}")
            protocol.send_packet(packet, destination)  # Retry sending