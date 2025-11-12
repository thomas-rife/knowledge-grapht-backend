import { describe, it } from 'node:test'
import { equal, deepEqual } from 'node:assert/strict'
import supertest from 'supertest'
import app from '../src/index.js'
import { testStudentClasses, testStudentLessons, testStudentGraphData } from '../mockData.js'
import e from 'express'

const request = supertest(app)

// describe('GET /', () => {
//   it('should respond with "IT WORKS 😊" on /', async () => {
//     const response = await request.get('/')

//     deepEqual(response.status, 200)
//     deepEqual(response.text, 'IT WORKS 😊')
//   })
// })

// describe('POST /login', () => {
//   it('should return 400 if email or password is missing', async () => {
//     const response = await request
//       .post('/login')
//       .send({ email: process.env.TEST_STUDENT_EMAIL })
//       .set('Content-Type', 'application/json')

//     equal(response.status, 400)
//     equal(response.body.error, 'Email and password are required')
//   })

//   it('should return 401 if invalid email or password is provided', async () => {
//     const response = await request.post('/login').send({
//       email: 'dummy_email@email.com',
//       password: 'password',
//     })

//     equal(response.status, 401)
//     equal(response.body.error, 'Invalid login credentials')
//   })

//   it('should return 200 if valid email and password are provided', async () => {
//     const response = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     equal(response.status, 200)
//     equal(response.text, 'Logged in!')
//   })
// })

// describe('POST /logout', () => {
//   it('should return 204 if user is logged in and logs out', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       .post('/logout')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 204)
//   })

//   it('should return 204 if user is not logged in but tries to log out', async () => {
//     const response = await request.post('/logout')

//     equal(response.status, 204)
//   })
// })

// describe('GET /user/account-info', () => {
//   it('should return 401 if user is not logged in', async () => {
//     const response = await request.get('/user/account-info')

//     equal(response.status, 401)
//   })

//   it('should return 200 if user is logged in', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       .get('/user/account-info')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 200)
//     deepEqual(response.body, {
//       userID: process.env.TEST_STUDENT_ID,
//       email: process.env.TEST_STUDENT_EMAIL,
//     })
//   })
// })

// describe('GET /user/enrolled-classes', () => {
//   it('should return 401 if user is not logged in', async () => {
//     const response = await request.get('/user/enrolled-classes')

//     equal(response.status, 401)
//   })

//   it('should return 200 and enrolled classes if user is logged in', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       .get('/user/enrolled-classes')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 200)
//     equal(response.body.length, 4)
//     deepEqual(response.body, testStudentClasses)
//   })
// })

// describe('GET /user/enrolled-class/:id', () => {
//   it('should return 401 if user is not logged in', async () => {
//     const response = await request.get('/user/enrolled-class/1')

//     equal(response.status, 401)
//   })

//   it('should return 200 if user is logged in', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       .get('/user/enrolled-class/1')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 200)
//     deepEqual(response.body, [testStudentClasses[0]])
//   })
// })

// // TODO: add tests that test input validation
// describe('GET /user/enrolled-class/:id/lessons', () => {
//   it('should return 401 if user is not logged in', async () => {
//     const response = await request.get('/user/enrolled-class/1/lessons')
//     equal(response.status, 401)
//   })

//   it('should return 200 and lesson contents for class 1', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       // .get(`/user/enrolled-class/'hi'/lessons`)
//       .get('/user/enrolled-class/1/lessons')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 200)
//     deepEqual(response.body, [testStudentLessons[0]])
//   })

//   it('should return 200 and lesson contents for class 2', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       .get('/user/enrolled-class/2/lessons')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 200)
//     deepEqual(response.body, [testStudentLessons[1]])
//   })

//   it('should return 200 and lesson contents for class 3', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       .get('/user/enrolled-class/3/lessons')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 200)
//     deepEqual(response.body, [testStudentLessons[2]])
//   })

//   it('should return 200 and lesson contents for class 4', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       .get('/user/enrolled-class/4/lessons')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 200)
//     deepEqual(response.body, [testStudentLessons[3]])
//   })
// })

// describe('GET /user/enrolled-class/:id/lesson/:lessonID', () => {
//   it('should return 401 if user is not logged in', async () => {
//     const response = await request.get('/user/enrolled-class/1/lesson/1')
//     equal(response.status, 401)
//   })

//   it('should return 200 and lesson contents for class 1 and lesson 1', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       .get('/user/enrolled-class/1/lesson/1')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 200)
//     deepEqual(response.body, [testStudentLessons[0]])
//   })

//   it('should return 200 and lesson contents for class 2 and lesson 2', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       .get('/user/enrolled-class/2/lesson/2')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 200)
//     deepEqual(response.body, [testStudentLessons[1]])
//   })

//   it('should return 200 and lesson contents for class 3 and lesson 3', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       .get('/user/enrolled-class/3/lesson/3')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 200)
//     deepEqual(response.body, [testStudentLessons[2]])
//   })

//   it('should return 200 and lesson contents for class 4 and lesson 4', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       .get('/user/enrolled-class/4/lesson/4')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 200)
//     deepEqual(response.body, [testStudentLessons[3]])
//   })

//   it('should return empty list if lesson does not exist', async () => {
//     const loginResponse = await request
//       .post('/login')
//       .send({
//         email: process.env.TEST_STUDENT_EMAIL,
//         password: 'password',
//       })
//       .set('Content-Type', 'application/json')

//     const response = await request
//       .get('/user/enrolled-class/1/lesson/100')
//       .set('Cookie', loginResponse.headers['set-cookie'])

//     equal(response.status, 200)
//     deepEqual(response.body, [])
//   })
// })

describe('GET /user/enrolled-class/:id/knowledge-graph', () => {
  it('should return 401 if user is not logged in', async () => {
    const response = await request.get('/user/enrolled-class/1/knowledge-graph')
    equal(response.status, 401)
  })

  it('should return 400 if class ID is not a number', async () => {
    const loginResponse = await request
      .post('/login')
      .send({
        email: process.env.TEST_STUDENT_EMAIL,
        password: 'password',
      })
      .set('Content-Type', 'application/json')

    const response = await request
      .get('/user/enrolled-class/invalid/knowledge-graph')
      .set('Cookie', loginResponse.headers['set-cookie'])

    equal(response.status, 400)
    equal(response.body.error, 'Class ID must be a number')
  })

  it('should return 400 if class ID is not a number', async () => {
    const errorMessage = 'Class ID must be a number'
    const errorStatus = 400
    const loginResponse = await request
      .post('/login')
      .send({
        email: process.env.TEST_STUDENT_EMAIL,
        password: 'password',
      })
      .set('Content-Type', 'application/json')

    const response = await request
      .get('/user/enrolled-class/null/knowledge-graph')
      .set('Cookie', loginResponse.headers['set-cookie'])

    equal(response.status, errorStatus)
    equal(response.body.error, errorMessage)

    const response2 = await request
      .get('/user/enrolled-class/undefined/knowledge-graph')
      .set('Cookie', loginResponse.headers['set-cookie'])

    equal(response2.status, errorStatus)
    equal(response2.body.error, errorMessage)

    const response3 = await request
      .get('/user/enrolled-class/hi/knowledge-graph')
      .set('Cookie', loginResponse.headers['set-cookie'])

    equal(response3.status, errorStatus)
    equal(response3.body.error, errorMessage)
  })

  it('should return 200 and knowledge graph for class 1', async () => {
    const loginResponse = await request
      .post('/login')
      .send({
        email: process.env.TEST_STUDENT_EMAIL,
        password: 'password',
      })
      .set('Content-Type', 'application/json')

    const response = await request
      .get('/user/enrolled-class/1/knowledge-graph')
      .set('Cookie', loginResponse.headers['set-cookie'])

    equal(response.status, 200)
    deepEqual(response.body, testStudentGraphData[0])
  })
})
