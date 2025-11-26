class AdvancedCommunicationProtocol:
    # ... existing code ...

    def log_intrusion_attempt(self, packet: dict):
        """
        Logs details of a potential intrusion attempt.
        """
        log_entry = {
            "packet_id": packet.get("packet_id"),
            "timestamp": packet.get("timestamp"),
            "encrypted_data": packet.get("data"),
        }
        print(f"Intrusion attempt logged: {log_entry}")