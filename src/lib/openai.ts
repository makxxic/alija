import OpenAI from 'openai'
import { prisma } from './prisma'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function getAIResponse(input: string, callId: string): Promise<string> {
  // Get conversation
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { conversation: { include: { messages: true } } }
  })
  if (!call || !call.conversation) return 'Sorry, there was an error.'

  const conversation = call.conversation

  // Add user message
  try {
    const existing = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        role: 'user',
        content: input
      }
    })
    if (!existing) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: input
        }
      })
    }
  } catch (e) {
    console.error('Error saving user message (openai):', e)
  }

  // Get messages for OpenAI
  const messages = conversation.messages.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content
  }))

  // Add system prompt
  messages.unshift({
    role: 'system',
    content: 'You are a compassionate mental health AI assistant. Listen actively, provide support, and detect if the user needs professional help. If they mention suicide or self-harm, suggest immediate help.'
  })

  try {
    // Add timeout to prevent hanging
    const completionPromise = openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      max_tokens: 150
    })

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI response timeout')), 10000) // 10 seconds
    )

    const completion = await Promise.race([completionPromise, timeoutPromise]) as { choices: { message: { content: string } }[] }

    const response = completion.choices[0].message.content || 'I\'m here to listen.'

    // Save assistant message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: response
      }
    })

    // Check for crisis
    if (input.toLowerCase().includes('suicide') || input.toLowerCase().includes('kill myself')) {
      // TODO: handle crisis
      return response + ' Please call emergency services at 911 if you\'re in immediate danger.'
    }

    return response
  } catch (error) {
    console.error('OpenAI error:', error)
    if (error instanceof Error && error.message === 'AI response timeout') {
      return 'I\'m taking a bit longer to respond. Please hold on.'
    }
    return 'I\'m sorry, I\'m having trouble responding right now. Please try again.'
  }
}