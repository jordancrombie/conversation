import hashlib
import json

class AdvancedCommunicationProtocol:
    # ... existing code ...

    def send_packet(self, packet: dict, destination: str, retries=0):
        """
        Sends a packet to a destination, retrying up to MAX_RETRIES times if an error occurs.
        """
        # Compute the hash of the packet and include it in the packet
        packet['hash'] = self.compute_hash(packet)

        # ... send the packet ...

        # If it's a data packet, wait for an ACK or NACK
        if packet['type'] == 'data':
            response = self.receive_packet()  # This will need to be implemented

            if response['type'] == 'nack':
                # If we received a NACK, resend the packet
                self.send_packet(packet, destination, retries + 1)

    def receive_packet(self, packet: dict, retries=0) -> dict:
        """
        Receives a packet and performs basic validation, retrying up to MAX_RETRIES times if an error occurs.
        """
        # ... receive the packet ...

        # Compute the hash of the received packet (without the hash field)
        received_hash = packet.pop('hash', None)
        computed_hash = self.compute_hash(packet)

        # If the hashes don't match, send a NACK and raise an error
        if received_hash != computed_hash:
            nack = {'type': 'nack'}
            self.send_packet(nack, packet['source'])
            raise ValueError(f"Packet hash does not match computed hash: {received_hash} != {computed_hash}")
        
        # If it's a data packet, send an ACK
        if packet['type'] == 'data':
            ack = {'type': 'ack'}
            self.send_packet(ack, packet['source'])

        return packet