import time

class AdvancedCommunicationProtocol:
    MAX_RETRIES = 3  # Maximum number of retries
    INITIAL_DELAY = 1  # Initial delay in seconds
    BACKOFF_MULTIPLIER = 2  # Factor by which the delay increases on each retry

    def send_packet(self, packet: dict, destination: str, retries=0):
        """
        Sends a packet to a destination, retrying up to MAX_RETRIES times if an error occurs,
        with exponential backoff.
        """
        delay = self.INITIAL_DELAY * (self.BACKOFF_MULTIPER ** retries)
        print(f"Error occurred while sending packet, retrying ({retries + 1}/{self.MAX_RETRIES})... (Delay: {delay:.2f} seconds)")
        time.sleep(delay)
        if packet.get("error_code") is not None and retries < self.MAX_RETRIES:
            self.send_packet(packet, destination, retries + 1)

    def receive_packet(self, packet: dict, retries=0) -> dict:
        """
        Receives a packet and performs basic validation, retrying up to MAX_RETRIES times if an error occurs,
        with exponential backoff.
        """
        delay = self.INITIAL_DELAY * (self.BACKOFF_MULTIPER ** retries)
        print(f"Error occurred while receiving packet, retrying ({retries + 1}/{self.MAX_RETRIES})... (Delay: {delay:.2f} seconds)")
        time.sleep(delay)
        if packet.get("error_code") is not None and retries < self.MAX_RETRIES:
            self.receive_packet(packet, retries + 1)