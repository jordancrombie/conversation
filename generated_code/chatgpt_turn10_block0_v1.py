# ... existing code ...

class AdvancedCommunicationProtocol:
    # ... existing code ...

    def send_packet(self, packet: dict, destination: str):
        """
        Sends a packet to a destination.
        """
        # Encrypt the data in the packet before sending
        packet['data'] = self.encrypt_data(packet['data'])

        print(f"Sending packet to {destination}: {packet}")
        # Simulate potential errors
        if packet["data"].get("invalid_field") == "true":
            packet["error_code"] = ErrorCode.INVALID_DATA.value
        elif packet["timestamp"] > time.time() - 5: #Simulate timeout
            packet["error_code"] = ErrorCode.TIMEOUT.value
        # Check for potential intrusion
        elif self.detect_intrusion(packet):
            packet["error_code"] = ErrorCode.UNAUTHORIZED_ACCESS.value
        print(f"Packet received with error code: {packet.get('error_code')}")

    def receive_packet(self, packet: dict) -> dict:
        """
        Receives a packet and performs basic validation.
        """
        if packet.get("error_code"):
            print(f"Error received: {self.error_codes.get(packet['error_code'], 'Unknown Error')}")
            return packet  # Return the packet with the error
        else:
            # Decrypt the data in the packet upon receiving
            packet['data'] = self.decrypt_data(packet['data'])

        print(f"Received packet: {packet}")
        return packet