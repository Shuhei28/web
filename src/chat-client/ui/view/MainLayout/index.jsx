import React                from "react"
import ReactDOM             from "react-dom"
import { Redirect }         from "react-router"
import Header               from "chat-client/ui/view/Header"
import NavigationBar        from "chat-client/ui/view/navigation/NavigationBar"
import TelephoneDialog      from "chat-client/ui/view/TelephoneDialog"
import setState             from "chat-client/util/setState"

import classNames from "chat-client/ui/view/MainLayout/classNames"

const executeNotification = ({
    title,
    body,
}) => {
    if (!window.Notification)
        return

    const x = new Notification(
        title,
        {
            body,
            icon: "/img/sgnz-chat-notification.png"
        }
    )

    x.onclick = _ => {
        window.focus();
        x.close()
    }
    setTimeout(_ => x.close(), 5000)
}


export default class extends React.Component {
    componentWillMount() {
        this.setState({
            callState          : {
                isReceiving: false,
                isTalking  : false,
                isCalling  : false
            },
            isFirstSubscribe   : true,
            subNavigationIsView: true,
            subNavigationType  : "friend",
            user               : undefined,
            unsubscribers      : [],
            rooms              : []
        })
    }

    componentDidMount() {
        ;(async _ => {

            if (window.Notification && Notification.permission === "default")
                Notification.requestPermission(r => {
                    if (r === "granted") {
                        executeNotification({
                            title: "Welcome to Sgnz Chat!",
                            body: "通知をおしらせします。"
                        })
                    }
                })
            
            const token = await new Promise((resolve, reject) => {
                const loop = _ => {
                    const x = this.props.tokenApi.read()
                    if(x)
                        resolve(x)
                    else
                        setTimeout(loop, 100)
                }
                loop()
            })

            const {
                tokenApi,
                databaseApi: {
                    userApi,
                    roomMessageApi
                },
                rtcApi
            } = this.props

            let user = await userApi.read()

            if (!user) {
                const x = tokenApi.read();
                await userApi.create({
                    user: {
                        id         : x.user.uid,
                        avatarUrl  : x.photoURL    || "http://placehold.jp/464ed6/ffffff/150x150.png?text=Avatar",
                        displayName: x.displayName || "unname",
                        email      : x.email       || "",
                        friends    : [],
                        name       : x.name || "unname",
                        rooms      : []
                    }
                })
                
                user = await userApi.read()
            }
            await setState(
                this,
                {user}
            )
            // user room subscriber 

            const roomMessageSubscriber = (room, messages) => {

                const targetRoom = (this.state.rooms.find(x => x.id == room.id) || {})

                const prevMessages = targetRoom.messages || []

                const newMessages = messages.filter(x => !prevMessages.map(y => y.id).includes(x.id))

                if (newMessages)
                    for (const message of newMessages)
                        if (message.sender.id != user.id && !this.state.isFirstSubscribe && document.hidden)
                            executeNotification({
                                title: room.type == "pair" ? (user.friends.find(x => room.id == x.roomId) || {}).name
                                     :                       targetRoom.name,
                                body : message.type == "text" ? message.value
                                     :                          "新着メッセージ"
                            })
                
                this.state.isFirstSubscribe && this.setState({
                    isFirstSubscribe: false
                })

                this.setState({
                    rooms: this.state.user.rooms.map(x => {
                        if (x.id == room.id)
                            x.messages = messages

                        return x
                    })
                })
            }

            const userUnsubscriber = userApi.subscribe({
                subscriber: user => {
                    const newRooms =  user.rooms.filter(room => !this.state.rooms.map(x => x.id).includes(room.id))

                    if (newRooms) {
                        this.setState({
                            unsubscribers: this.state.unsubscribers.concat(
                                newRooms.map(x => 
                                    roomMessageApi.subscribe({
                                        room: {
                                            id: x.id
                                        },
                                        subscriber: next => roomMessageSubscriber(x, next)
                                    }))
                            )
                        })
                    }

                    this.setState({user})
                }
            })

            this.setState({
                unsubscribers: this.state.unsubscribers.concat(userUnsubscriber)
            })

            // rtcApi subscriber

            const rtcApiReceiveUnsubscribe = rtcApi.subscribeReceive(
                async call => {

                    const sourceUser = await userApi.read({
                        user: {
                            id: call.metadata.sourceUserId
                        }
                    })

                    this.setState({
                        callState: {
                            sourceUser,
                            isReceiving: true,
                            isTalking  : false,
                            call
                        }
                    })
                }
            )

            this.setState({
                unsubscribers: this.state.unsubscribers.concat([rtcApiReceiveUnsubscribe])
            })

        })()
    }

    componentWillUnmount() {
        for (let f of this.state.unsubscribers)
            f()
    }

    render() {
        const {
            children,
            databaseApi,
            history,
            location,
            onError,
            tokenApi,
            rtcApi,
            ...props
        } = this.props

        const token = tokenApi.read();

        try {

            if (token) {
                if (/\/sign_in/.test(location.pathname))
                    return (
                        <Redirect
                            to={(location.state && location.state.from) || "/"}
                        />
                    )
            } else {
                if (/\/sign_in/.test(location.pathname))
                    return React.cloneElement(
                        children,
                        {
                            location,
                            onError,
                            tokenApi,
                            ...props,
                            ...children.props
                        }
                    )
                    
                else
                    return (
                        <Redirect
                            to={{
                                pathname: "/sign_in",
                                state: {
                                    from: location
                                }
                            }}
                        />
                    )
            }

        } catch (e) {
            onError(e)
        }

        return (
            <div
                className={classNames.Host}
            >
                <audio  
                    autoPlay
                    playsInline
                />
                <Header
                    className={classNames.Header}
                    onSignOutButtonClcik={async _ => {
                        await tokenApi.delete()

                        // // TODO fix
                        window.location.reload()
                    }}
                    onNavButtonClick={_ => 
                        this.setState({subNavigationIsView: !this.state.subNavigationIsView})
                    }
                />
                <div
                    className={classNames.Content}
                >
                    <NavigationBar
                        history={history}
                        location={location}
                        onChange={type => this.setState({
                            subNavigationIsView: true,
                            subNavigationType  : type
                        })}
                        selectedType={this.state.subNavigationType}
                    />
                    <main
                        className={classNames.Main}
                    >
                        {this.state.user && React.cloneElement(
                            children,
                            {
                                telephoneCall: async userId => {

                                    const sourceUser = await databaseApi.userApi.read({
                                        user: {
                                            id: userId
                                        }
                                    })

                                    const stream = await rtcApi.createStream("voice");
                                    
                                    const call = await rtcApi.call(userId, stream, "voice");

                                    this.setState({
                                        callState: {
                                            sourceUser,
                                            call,
                                            isCalling  : true,
                                            isReceiving: false,
                                            isTalking  : false
                                        }
                                    })

                                    const audioElement = ReactDOM.findDOMNode(this).children[0]
                                    
                                    call.on("close", () => {
                                        audioElement.srcObject = null
                                        this.setState({
                                            callState: {
                                                sourceUser : undefined,
                                                call       : undefined,
                                                isReceiving: false,
                                                isTalking  : false,
                                                isCalling  : false
                                            }
                                        })
                                    })

                                    const partnerStream = await new Promise(resolve => {
                                        call.on("stream", x => 
                                            resolve (x)
                                        )
                                    })

                                    audioElement.srcObject = partnerStream
                                    audioElement.play()

                                    this.setState({
                                        callState: {
                                            sourceUser,
                                            call,
                                            isCalling  : false,
                                            isReceiving: false,
                                            isTalking  : true
                                        }
                                    })

                                },
                                changeSubNavigationView: bool => this.setState({subNavigationIsView: bool}),
                                databaseApi,
                                history,
                                location,
                                rtcApi,
                                subNavigationIsView: this.state.subNavigationIsView,
                                subNavigationType: this.state.subNavigationType,
                                tokenApi,
                                user: this.state.user,
                                rooms: this.state.rooms,
                                ...props,
                                ...children.props
                            }
                        )}
                    </main>
                </div>
                <TelephoneDialog
                    isCalling={this.state.callState.isCalling}
                    isTalking={this.state.callState.isTalking}
                    isVisible={this.state.callState.isReceiving || this.state.callState.isTalking || this.state.callState.isCalling}
                    user={this.state.callState.sourceUser}
                    onAnswerButtonClick={async _ => {

                        const stream = await rtcApi.createStream("voice");

                        
                        this.state.callState.call.on("close", () => {
                            audioElement.srcObject = null
                            this.setState({
                                callState: {
                                    sourceUser : undefined,
                                    call       : undefined,
                                    isReceiving: false,
                                    isTalking  : false,
                                    isCalling  : false
                                }
                            })
                        })

                        this.state.callState.call.answer(stream)
                        const partnerStream = await new Promise(resolve => 
                            this.state.callState.call.on("stream", x => {
                                resolve (x)
                            })
                        )

                        const audioElement = ReactDOM.findDOMNode(this).children[0]

                        audioElement.srcObject = partnerStream
                        audioElement.play()

                        this.setState({
                            callState: {
                                sourceUser : this.state.callState.sourceUser,
                                call       : this.state.callState.call,
                                isReceiving: false,
                                isTalking  : true,
                                isCalling  : false
                            }
                        })
                        
                    }}
                    onCloseButtonClick={_ => {
                        this.state.callState.call.close()
                        this.setState({
                            callState: {
                                sourceUser : undefined,
                                call       : undefined,
                                isReceiving: false,
                                isTalking  : false,
                                isCalling  : false
                            }
                        })
                    }}
                />
            </div>
        )
    }
}
