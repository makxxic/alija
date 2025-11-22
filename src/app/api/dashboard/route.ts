import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Get ongoing AI calls (active within last 10 minutes)
    const tenMinutesAgo = new Date()
    tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10)

    const ongoingCalls = await prisma.call.findMany({
      where: {
        status: 'ai_handling'
      },
      include: {
        user: true,
        conversation: { include: { messages: { orderBy: { timestamp: 'desc' }, take: 5 } } }
      },
      orderBy: { startedAt: 'desc' }
    })

    // Debug: Also get all calls to see what's in the database
    const allCalls = await prisma.call.findMany({
      select: { id: true, status: true, twilioCallSid: true, startedAt: true },
      orderBy: { startedAt: 'desc' },
      take: 10
    })
    console.log('All recent calls:', allCalls)

    // Get stats for today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const [completedTodayCount, totalEscalationsCount] = await Promise.all([
      prisma.call.count({
        where: {
          status: { not: 'ai_handling' },
          startedAt: { gte: today, lt: tomorrow }
        }
      }),
      prisma.escalation.count()
    ])

    // Get call logs (completed calls) - increase limit
    const callLogs = await prisma.call.findMany({
      where: { status: { not: 'ai_handling' } },
      include: {
        user: true,
        escalation: { include: { counselor: true } }
      },
      orderBy: { startedAt: 'desc' },
      take: 50 // Increased limit
    })

    // Get escalations
    const escalations = await prisma.escalation.findMany({
      include: { call: { include: { user: true } }, counselor: true },
      orderBy: { escalatedAt: 'desc' },
      take: 20
    })

    console.log(`Dashboard data: ${ongoingCalls.length} ongoing calls, ${callLogs.length} call logs, ${escalations.length} escalations`)

    return NextResponse.json({
      ongoingCalls,
      callLogs,
      escalations,
      stats: {
        completedToday: completedTodayCount,
        totalEscalations: totalEscalationsCount
      }
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}