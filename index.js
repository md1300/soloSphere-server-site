const express=require('express')
const cors=require('cors')
const jwt = require('jsonwebtoken');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId,} = require('mongodb');
const cookieParser = require('cookie-parser');
const port=process.env.PORT|| 9000

const app=express()

const corsOptions={
    origin:['http://localhost:5173',
      'http://localhost:5174',
      'https://solosphere-7.web.app'],
    credentials: true,
    optionSuccessStatus:200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())


// verify jwt middleware -----------
const verifyToken=(req,res,next)=>{
  const token=req.cookies?.token;
  if(!token) return res.status(401).send({message:'unauthorized access'})
  if(token){
    jwt.verify(token,process.env.ACCESS_TOKEN_SECRETS,(error,decoded)=>{
      if(error){
        console.log(error)
        return res.status(401).send({message:'unauthorized access'})
      }
      // console.log(decoded)
      req.user=decoded ;
      next()
    })
  }
  // console.log(token)
  
}



app.get('/',(req,res)=>{
    res.send('the server is running')
})




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vmhty.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
          
    const jobsCollection=client.db('soloSphere').collection('jobs')
    const bidsCollection=client.db('soloSphere').collection('bids')

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // creating jwt token -------------

    app.post('/jwt',async(req,res)=>{
      const email=req.body;
      const token=await jwt.sign(email,process.env.ACCESS_TOKEN_SECRETS,{ expiresIn: '365d' })
      res
      .cookie('token',token,{
        httpOnly: true,
        secure: process.env.NODE_ENV==='production',
        sameSite: process.env.NODE_ENV==='production'?'none':'strict'
      })
      .send({success:true})
    })

    // clear cookies --------------------
    app.get('/logOut',(req,res)=>{
      res.clearCookie('token',{
        httpOnly:true,
        secure:process.env.NODE_ENV==='production',
        sameSite:process.env.NODE_ENV==='production'?'none':'strict',
        maxAge:0
      }).send({success:true})
    })

// get all data  from jobs collection----------------
 app.get('/jobs',async(req,res)=>{
   const result=await jobsCollection.find().toArray()
   res.send(result)
 })

 app.get('/job/:id',async(req,res)=>{
  const id =req.params.id;
  const query={_id:new ObjectId(id)}
  const result=await jobsCollection.findOne(query)
  res.send(result)
 })
//  save data in bid db
  app.post('/bid',async(req,res)=>{
    const bidData=req.body;
    const query={
      email:bidData.email,
      job_id:bidData.job_id
    }
    const alreadyApplied=await bidsCollection.findOne(query)
    if(alreadyApplied){
      return res.status(400).send('you have already placed a bid on this job')
    }
    const result=await bidsCollection.insertOne(bidData) 
    res.send(result)
  })
//  save data in  jobs db
  app.post('/job',async(req,res)=>{
    const jobData=req.body;
    const result=await jobsCollection.insertOne(jobData) 
    res.send(result)
  })

  // get my all posted jobs  from mongodb
  app.get('/jobs/:email',verifyToken, async(req,res)=>{
    const tokenEmail=req.user.email;
    // console.log(tokenData,'from token')
    const email=req.params.email ;
    if(tokenEmail!==email){
      return res.status(403).send({message:'forbidden access'})
    }
    const query={'buyer.email':email}
    const result=await jobsCollection.find(query).toArray();
    res.send(result)
  })

  // delete data from posted jobs from mongoDb
  app.delete('/job/:id',async(req,res)=>{
    const id=req.params.id ;
    const query={_id:new ObjectId(id)}
    const result=await jobsCollection.deleteOne(query)
    res.send(result)
  })

  // updated  posted job data from mongoDb
   
    app.put('/job/:id',async(req,res)=>{
      const id=req.params.id ;
      const jobData=req.body ;
      
      const filter={_id:new ObjectId(id)}
      
      const options={upsert:true}
      const updateDoc={
        $set:{
          ...jobData
        }
      }
      const result=await jobsCollection.updateOne(filter,updateDoc,options)
      res.send(result)
    })

    // get my all bids data from bids collection
    
    app.get('/my-bids/:email',verifyToken,async(req,res)=>{
      const email=req.params.email;
      const tokenEmail=req.user.email;
      if(tokenEmail!==email){
        return res.status(403).send({message:'forbidden access'})
      }
      const query={email}
      const result=await bidsCollection.find(query).toArray()
      res.send(result)
    })

    // get all bids requseted data from bids collection

    app.get('/bids-requests/:email',verifyToken, async(req,res)=>{
      const email=req.params.email; 
      const tokenEmail=req.user.email;
      if(tokenEmail!==email){
        return res.status(403).send({message:'forbidden access'})
      }
      const query={'buyer.email':email}
      const result=await bidsCollection.find(query).toArray()
      res.send(result)
    })

    // update status in  posted data     ------------
     app.patch('/bid/:id',async(req,res)=>{
      const id=req.params.id ;
      const status=req.body ;
     console.log(id)
      const query={_id:new ObjectId(id)} ;
      const updateStatus={
        $set:{...status}
      }
      const result=await bidsCollection.updateOne(query,updateStatus)
      res.send(result)
     })

// get all jobs data form db for pagination 
     app.get('/all-jobs',async(req,res)=>{
      const size=parseInt(req.query.size)
      const page=parseInt(req.query.page)-1 
      const filter=req.query.filter
      const sort=req.query.sort
      const search=req.query.search
      let query={
        job_title:{$regex:search,$options:'i'}
      }

      if(filter)query.category=filter
      
       let options={} 
       if(sort)options={sort:{deadline:sort==='asc'?1:-1}}
      console.log(size,page,filter)
      const result=await jobsCollection.find(query,options).skip(size*page).limit(size).toArray()
      res.send(result)
    })

// get all jobs data form db for count
     app.get('/jobs-count',async(req,res)=>{
      const filter=req.query.filter
      const search=req.query.search
     let query={
      job_title:{$regex:search,$options:'i'}
     }
     if(filter)query.category=filter
      const count=await jobsCollection.countDocuments(query)
      res.send({count})
    })
    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.listen(port,()=>{
    console.log(`server running on port ${port}`)
})