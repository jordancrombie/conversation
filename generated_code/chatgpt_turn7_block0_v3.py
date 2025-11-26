import time

class AdvancedCommunicationProtocol:
    MAX_RETRIES = 3  # Maximum number of retries
    INITIAL_DELAY = 1  # Initial delay in seconds
    BACKOFF_MULTIPLIER = 2  # Factor by which the delay increases each time

    # ... existing code ...

    def send_packet(self, packet: dict, destination: str, retries=0):
        """
        Sends a packet to a destination, retrying up to MAX_RETRIES times if an error occurs.
        """
        # ... existing code ...

        # If an error occurs and we haven't reached the maximum number of retries, retry sending the packet
        if packet.get("error_code") is not None and retries < self.MAX_RETRIES:
            delay = self.INITIAL_DELAY * (self.BACKOFF_MULTIPLIER ** retries)
            print(f"Error occurred while sending packet, retrying in {delay} seconds ({retries + 1}/{self.MAX_RETRIES})...")
            time.sleep(delay)  # Wait before retrying
            self.send_packet(packet, destination, retries + 1)

    def receive_packet(self, packet: dict, retries=0) -> dict:
        """
        Receives a packet and performs basic validation, retrying up to MAX_RETRIES times if an error occurs.
        """
        # ... existing code ...

        # If an error occurs and we haven't reached the maximum number of retries, retry receiving the packet
        if packet.get("error_code") is not None and retries < self.MAX_RETRIES:
            delay = self.INITIAL_DELAY * (self.BACKOFF_MULTIPLIER ** retries)
            print(f"Error occurred while receiving packet, retrying in {delay} seconds ({retries + 1}/{self.MAX_RETRIES})...")
            time.sleep(delay)  # Wait before retrying
            self.receive_packet(packet, retries + 1)