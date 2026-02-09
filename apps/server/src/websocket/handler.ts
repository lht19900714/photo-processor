import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { jwtVerify } from 'jose';
import { getTaskManager } from '../services/task-manager.service.js';
import type { ServerWSEvent, ClientWSEvent } from '@photo-processor/shared';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-secret-change-me'
);

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  username?: string;
  subscribedTasks: Set<number>;
  isAlive: boolean;
}

/**
 * WebSocket handler for real-time task updates
 */
export class WSHandler {
  private wss: WebSocketServer;
  private clients: Set<AuthenticatedWebSocket> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws as AuthenticatedWebSocket, req);
    });

    // Subscribe to task manager events
    const taskManager = getTaskManager();
    taskManager.subscribe((event) => {
      this.broadcastToSubscribers(event);
    });

    // Start ping interval
    this.startPingInterval();

    console.log('✓ WebSocket server initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(
    ws: AuthenticatedWebSocket,
    req: IncomingMessage
  ): Promise<void> {
    ws.subscribedTasks = new Set();
    ws.isAlive = true;

    // Extract token from query string
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'No token provided');
      return;
    }

    // Verify token
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      ws.userId = payload.userId as number;
      ws.username = payload.username as string;
    } catch (error) {
      ws.close(4002, 'Invalid token');
      return;
    }

    // Add to clients
    this.clients.add(ws);
    console.log(`WebSocket client connected: ${ws.username}`);

    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientWSEvent;
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('Invalid WebSocket message:', error);
      }
    });

    // Handle pong
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle close
    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`WebSocket client disconnected: ${ws.username}`);
    });

    // Handle error
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.clients.delete(ws);
    });

    // Send welcome message
    this.sendToClient(ws, {
      type: 'log',
      taskId: 0,
      level: 'info',
      message: 'Connected to WebSocket server',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(ws: AuthenticatedWebSocket, message: ClientWSEvent): void {
    switch (message.type) {
      case 'subscribe':
        ws.subscribedTasks.add(message.taskId);
        console.log(`Client ${ws.username} subscribed to task ${message.taskId}`);
        break;

      case 'unsubscribe':
        ws.subscribedTasks.delete(message.taskId);
        console.log(`Client ${ws.username} unsubscribed from task ${message.taskId}`);
        break;

      default:
        console.warn('Unknown message type:', message);
    }
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(ws: AuthenticatedWebSocket, event: ServerWSEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  /**
   * Broadcast event to clients subscribed to the task
   */
  private broadcastToSubscribers(event: ServerWSEvent): void {
    const taskId = 'taskId' in event ? event.taskId : 0;

    for (const client of this.clients) {
      // Send if client is subscribed to this task or it's a global event (taskId = 0)
      if (taskId === 0 || client.subscribedTasks.has(taskId)) {
        this.sendToClient(client, event);
      }
    }
  }

  /**
   * Start ping interval to detect dead connections
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.terminate();
          this.clients.delete(client);
          continue;
        }

        client.isAlive = false;
        client.ping();
      }
    }, 30000);
  }

  /**
   * Close WebSocket server
   */
  close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    for (const client of this.clients) {
      client.close();
    }

    this.wss.close();
  }
}
