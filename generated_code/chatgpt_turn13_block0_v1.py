class AdvancedCommunicationProtocol:
    # ... existing code ...

    def send_packet(self, packet: dict, destination: str):
        """
        Sends a packet to a destination.
        """
        # Check protocol version
        if packet.get("protocol_version") != self.protocol_version:
            packet["error_code"] = ErrorCode.PROTOCOL_VERSION_MISMATCH.value
            print(f"Packet received with error code: {packet.get('error_code')}")
            return

        # ... existing code ...

    def receive_packet(self, packet: dict) -> dict:
        """
        Receives a packet and performs basic validation.
        """
        # Check protocol version
        if packet.get("protocol_version") != self.protocol_version:
            packet["error_code"] = ErrorCode.PROTOCOL_VERSION_MISMATCH.value
            print(f"Error received: {self.error_codes.get(packet['error_code'], 'Unknown Error')}")
            return packet  # Return the packet with the error

        # ... existing code ...